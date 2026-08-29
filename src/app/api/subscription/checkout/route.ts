/**
 * GET  /api/subscription/checkout — what can be bought, and how.
 * POST /api/subscription/checkout — start buying it.
 *
 * ── Why the row is written with the service role ──────────────────────────
 *
 * `payments` has an INSERT policy, and this route does not use it. That looks
 * backwards until you ask what a client-inserted subscription row would
 * contain: `amount_minor` and `entitlement_days` are columns, so a policy
 * permissive enough to allow the insert is permissive enough to allow
 * `{"amount_minor": 1, "entitlement_days": 36500}`. No WITH CHECK can validate
 * a price without hardcoding the price list into SQL and keeping two copies in
 * sync forever.
 *
 * So the request body carries exactly two things — which period, which method
 * — and every consequential field is read from `PRO_PLANS` here, server side.
 * The user's identity comes from `requireUser()`, not from the body.
 *
 * ── Two outcomes, NEITHER OF WHICH CHARGES ANYBODY ────────────────────────
 *
 *   card / demo   → a hosted-checkout session; the response is a redirect URL.
 *                   Settlement is the signed webhook.
 *
 *   bKash / Nagad / Rocket
 *                 → the payer submits a transaction id and the response is
 *                   "awaiting review". Nothing is granted until an admin
 *                   approves it in the console.
 *
 * Every method is a demonstration: no money moves on any of them, and
 * `is_sandbox` is written from `methodAvailability()` rather than assumed, so
 * a deployment that later configures a real merchant number starts recording
 * those rows correctly without a code change.
 *
 * No path here touches a PIN, an OTP or a card number. The manual one sees a
 * receipt number and nothing else.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { supabaseServiceRole } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/auth/config";
import { selectPaymentProvider, paymentStatus } from "@/lib/payments";
import {
  isPaymentMethodId,
  methodAvailability,
  methodById,
  normaliseMsisdn,
  normaliseReference,
} from "@/lib/payments/methods";
import { isBillingPeriod, planFor, PRO_PLANS } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  return NextResponse.json({
    plans: PRO_PLANS,
    // The merchant number is served here rather than embedded in the client
    // bundle, so it reaches signed-in payers instead of every crawler.
    methods: methodAvailability().map((m) => ({
      id: m.method.id,
      label: m.method.label,
      settlement: m.method.settlement,
      region: m.method.region,
      available: m.available,
      merchant_number: m.merchantNumber,
      is_demo: m.isDemo,
    })),
    provider: paymentStatus(),
    notice:
      "DEMONSTRATION ONLY — no method here charges anybody. Card and Demo run a sandbox " +
      "checkout settled by a signed webhook; bKash, Nagad and Rocket run the review flow, " +
      "where an administrator approves the transaction before Pro is granted. No card " +
      "number, PIN or OTP is collected on any path.",
  });
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isBillingPeriod(body.period)) {
    return NextResponse.json({ error: "bad_period" }, { status: 400 });
  }
  if (!isPaymentMethodId(body.method)) {
    return NextResponse.json({ error: "bad_method" }, { status: 400 });
  }

  const plan = planFor(body.period);
  const method = methodById(body.method)!;
  const db = supabaseServiceRole();

  // ── mobile money: recorded, then reviewed by a human ──────────────────
  if (method.settlement === "manual_review") {
    const availability = methodAvailability().find(
      (m) => m.method.id === method.id
    )!;

    const reference = normaliseReference(body.payer_reference);
    if (!reference) {
      return NextResponse.json(
        { error: "reference_required" },
        { status: 400 }
      );
    }
    // Optional. `normaliseMsisdn` returns null both for absent and for
    // malformed, and neither should block a payment an admin can still match
    // from the transaction id alone.
    const msisdn = normaliseMsisdn(body.payer_msisdn);

    const { data: payment, error } = await db
      .from("payments")
      .insert({
        provider: "manual",
        // True for every method today. Read from the catalogue rather than
        // hardcoded either way: a deployment that configures a real merchant
        // number must start recording these as real without anyone
        // remembering to change this line.
        is_sandbox: availability.isDemo,
        provider_session_id: `man_${randomUUID()}`,
        user_id: userId,
        created_by: userId,
        purpose: "pro_subscription",
        method: method.id,
        settlement: "manual_review",
        amount_minor: plan.price.amountMinor,
        currency: plan.price.currency,
        entitlement_days: plan.days,
        status: "pending",
        review_status: "pending",
        payer_reference: reference,
        payer_msisdn: msisdn,
      })
      .select("id")
      .single();

    if (error || !payment) {
      // 23505 on the partial index means this reference was already submitted.
      // Saying so beats a generic failure that invites the payer to send again.
      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "reference_already_submitted" },
          { status: 409 }
        );
      }
      console.error("[subscription] manual insert failed", error?.message);
      return NextResponse.json(
        { error: "could_not_record_payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payment_id: payment.id,
      status: "awaiting_review",
      settlement: "manual_review",
      merchant_number: availability.merchantNumber,
      is_demo: availability.isDemo,
      notice:
        "Recorded. An administrator reviews it before Pro is granted, so nothing " +
        "is active yet. DEMO: no money was moved and none is owed.",
    });
  }

  // ── card / demo: hosted checkout, settled by signed webhook ───────────
  const provider = selectPaymentProvider();

  const { data: payment, error } = await db
    .from("payments")
    .insert({
      provider: provider.name,
      is_sandbox: provider.isSandbox,
      provider_session_id: "pending",
      user_id: userId,
      created_by: userId,
      purpose: "pro_subscription",
      method: method.id,
      settlement: "provider_webhook",
      amount_minor: plan.price.amountMinor,
      currency: plan.price.currency,
      entitlement_days: plan.days,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !payment) {
    console.error("[subscription] insert failed", error?.message);
    return NextResponse.json(
      { error: "could_not_start_payment" },
      { status: 500 }
    );
  }

  const session = await provider.createCheckout({
    paymentId: payment.id,
    userId,
    purpose: "pro_subscription",
    money: plan.price,
    returnUrl: `${siteUrl()}/pro/checkout`,
  });

  const { error: updateError } = await db
    .from("payments")
    .update({ provider_session_id: session.sessionId })
    .eq("id", payment.id);

  if (updateError) {
    return NextResponse.json(
      { error: "could_not_start_payment" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    payment_id: payment.id,
    status: "redirect",
    settlement: "provider_webhook",
    redirect_url: session.redirectUrl,
    is_sandbox: provider.isSandbox,
    is_demo: true,
    notice: "DEMO ONLY. No card is collected and no money will be charged.",
  });
}
