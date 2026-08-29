/**
 * POST /api/admin/payments/decide — an administrator settles a mobile-money
 * transaction.
 *
 * This is the human half of the payment system. Someone sent money from their
 * bKash, Nagad or Rocket wallet to the merchant number and submitted the
 * transaction id; an admin opens the merchant statement, finds it, and says
 * whether it is there. Approving grants exactly what the stored payment row
 * says was bought — nothing in this request body can change that.
 *
 * ── Why this is a route handler and not a database policy ─────────────────
 *
 * `subscriptions` has no INSERT policy for anyone. An admin holds the role,
 * not the ability to write the table directly, so the grant runs through the
 * service role here after the role has been re-checked. That keeps the number
 * of places able to mint an entitlement at two — this and the webhook — and
 * both of them go through `grantEntitlement`.
 *
 * ── The control that matters most ─────────────────────────────────────────
 *
 * AN ADMIN MAY NOT APPROVE THEIR OWN PAYMENT. Shuru mints admins by referral
 * from other admins, so "an admin buys Pro and approves it" would be a free
 * subscription for anyone who ever gets referred, with a clean audit trail
 * saying it was reviewed. Another admin has to do it. (Admins get Pro features
 * from their role anyway — see lib/auth/pro.ts — so this refuses nothing an
 * admin actually needs.)
 */

import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { supabaseServiceRole } from "@/lib/supabase/server";
import { grantEntitlement, type FulfilablePayment } from "@/lib/payments/fulfil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let adminId: string;
  try {
    const admin = await requireRole("admin");
    adminId = admin.id;
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

  const paymentId = body.payment_id;
  if (typeof paymentId !== "string" || !paymentId) {
    return NextResponse.json({ error: "payment_id_required" }, { status: 400 });
  }
  const approve = body.approve === true;
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : null;

  // A rejection has to say why. The payer sees this text, and "rejected" with
  // no reason is indistinguishable from the system losing their money.
  if (!approve && !note) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const db = supabaseServiceRole();

  const { data: payment, error: readError } = await db
    .from("payments")
    .select(
      "id, purpose, status, settlement, review_status, entitlement_days, opportunity_id, user_id, amount_minor, currency, method, payer_reference"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }
  if (payment.settlement !== "manual_review") {
    // A webhook payment is settled by its provider. Letting an admin mark one
    // succeeded by hand would be a way to grant access with no money at all.
    return NextResponse.json(
      { error: "not_a_manual_payment" },
      { status: 409 }
    );
  }
  if (payment.review_status !== "pending") {
    // Already decided. 409 rather than a silent second decision — two admins
    // opening the same queue is normal, and the second one should be told.
    return NextResponse.json(
      { error: "already_reviewed", review_status: payment.review_status },
      { status: 409 }
    );
  }
  if (payment.user_id === adminId) {
    return NextResponse.json(
      { error: "cannot_review_own_payment" },
      { status: 403 }
    );
  }

  const now = new Date();
  const decidedAt = now.toISOString();

  // ── rejection ──────────────────────────────────────────────────────────
  if (!approve) {
    const { error } = await db
      .from("payments")
      .update({
        status: "failed",
        failure_reason: "rejected_by_admin",
        review_status: "rejected",
        reviewed_by: adminId,
        reviewed_at: decidedAt,
        review_note: note,
        completed_at: decidedAt,
      })
      .eq("id", payment.id)
      .eq("review_status", "pending"); // lose the race, change nothing

    if (error) {
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    await db.from("admin_audit_log").insert({
      actor_id: adminId,
      action: "payment.rejected",
      entity_type: "payment",
      entity_id: payment.id,
      after_state: {
        method: payment.method,
        payer_reference: payment.payer_reference,
        amount_minor: payment.amount_minor,
        currency: payment.currency,
      },
      note,
    });

    return NextResponse.json({ status: "rejected" });
  }

  // ── approval ───────────────────────────────────────────────────────────
  // Granted BEFORE the payment is marked succeeded, and the payment is only
  // marked succeeded if the grant worked. The other order can record a
  // completed purchase that delivered nothing, which is the failure a payer
  // cannot see and will not report until much later.
  const granted = await grantEntitlement(db, payment as FulfilablePayment, now);

  if (!granted.ok) {
    console.error("[payments] admin grant failed", granted.error);
    return NextResponse.json({ error: "grant_failed" }, { status: 500 });
  }

  const { error } = await db
    .from("payments")
    .update({
      status: "succeeded",
      review_status: "approved",
      reviewed_by: adminId,
      reviewed_at: decidedAt,
      review_note: note,
      completed_at: decidedAt,
    })
    .eq("id", payment.id)
    .eq("review_status", "pending");

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await db.from("admin_audit_log").insert({
    actor_id: adminId,
    action: "payment.approved",
    entity_type: "payment",
    entity_id: payment.id,
    after_state: {
      method: payment.method,
      payer_reference: payment.payer_reference,
      amount_minor: payment.amount_minor,
      currency: payment.currency,
      granted,
    },
    note,
  });

  return NextResponse.json({ status: "approved", granted });
}
