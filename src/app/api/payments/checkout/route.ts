/**
 * POST /api/payments/checkout — start a sandbox payment for a listing promotion.
 *
 * Writes a `pending` payment row and returns a redirect URL. It does NOT grant
 * anything: the entitlement is granted only by the webhook handler after a
 * verified provider event. That separation is the whole point — a client that
 * calls this endpoint a hundred times gets a hundred pending rows and zero
 * promotions.
 *
 * GET returns the price and the sandbox status so the UI can label the flow
 * honestly before the employer commits to anything.
 */

import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth/session";
import { supabaseServer, supabaseServiceRole } from "@/lib/supabase/server";
import {
  FEATURE_LISTING_DAYS,
  FEATURE_LISTING_PRICE,
  paymentStatus,
  selectPaymentProvider,
} from "@/lib/payments";
import { siteUrl } from "@/lib/auth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("employer");
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  return NextResponse.json({
    ...paymentStatus(),
    price: FEATURE_LISTING_PRICE,
    entitlement_days: FEATURE_LISTING_DAYS,
    // Stated in the payload, not only in the UI, so an integrator reading the
    // API cannot miss it either.
    notice:
      "SANDBOX ONLY. No money is charged and no card details are collected.",
  });
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const user = await requireRole("employer");
    userId = user.id;
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  let opportunityId: unknown;
  try {
    opportunityId = (await req.json())?.opportunity_id;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof opportunityId !== "string" || !opportunityId) {
    return NextResponse.json(
      { error: "opportunity_id_required" },
      { status: 400 }
    );
  }

  // Read the listing through the CALLER's session, not the service role. RLS
  // then decides whether they may see it at all, so an employer cannot start
  // a payment against another company's listing by guessing an id.
  const sb = await supabaseServer();
  const { data: listing, error } = await sb
    .from("opportunities")
    .select("id, company_id, status")
    .eq("id", opportunityId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!listing || !listing.company_id) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }
  if (listing.status !== "approved") {
    // Promoting a listing students cannot see would be selling nothing.
    return NextResponse.json(
      { error: "listing_not_approved", status: listing.status },
      { status: 409 }
    );
  }

  const provider = selectPaymentProvider();

  // Insert through the caller's session so `payments_insert` (company
  // membership, own user id, status pending, is_sandbox true) is enforced by
  // the database rather than trusted from here.
  const { data: payment, error: insertError } = await sb
    .from("payments")
    .insert({
      provider: provider.name,
      is_sandbox: provider.isSandbox,
      provider_session_id: "pending",
      company_id: listing.company_id,
      opportunity_id: listing.id,
      created_by: userId,
      purpose: "feature_listing",
      amount_minor: FEATURE_LISTING_PRICE.amountMinor,
      currency: FEATURE_LISTING_PRICE.currency,
      status: "pending",
      entitlement_days: FEATURE_LISTING_DAYS,
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    return NextResponse.json(
      { error: "could_not_start_payment" },
      { status: 403 }
    );
  }

  const session = await provider.createCheckout({
    paymentId: payment.id,
    companyId: listing.company_id,
    opportunityId: listing.id,
    purpose: "feature_listing",
    money: FEATURE_LISTING_PRICE,
    returnUrl: `${siteUrl()}/employer/billing/sandbox`,
  });

  // Record the provider's session id so the webhook can match it back. Service
  // role because there is deliberately no update policy on `payments`.
  const { error: updateError } = await supabaseServiceRole()
    .from("payments")
    .update({ provider_session_id: session.sessionId })
    .eq("id", payment.id);

  if (updateError) {
    return NextResponse.json({ error: "could_not_start_payment" }, { status: 500 });
  }

  return NextResponse.json({
    payment_id: payment.id,
    redirect_url: session.redirectUrl,
    is_sandbox: provider.isSandbox,
    notice: "SANDBOX ONLY. No money will be charged.",
  });
}

// Re-exported so the route module does not appear to swallow AuthError.
export type { AuthError };
