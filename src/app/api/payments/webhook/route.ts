/**
 * POST /api/payments/webhook — the ONLY place a payment becomes 'succeeded'
 * and the only place an entitlement is granted.
 *
 * Deliberately unauthenticated in the session sense: a payment provider has no
 * user session. Authentication is the signature on the request body, checked
 * by the provider adapter before this handler trusts a single field.
 *
 * Three properties this endpoint has to hold, in order of how badly they break
 * things when missing:
 *
 *  1. AUTHENTICITY — an unsigned or wrongly-signed request must change
 *     nothing. `verifyWebhook` throws rather than returning null so a missing
 *     null-check cannot become a free promotion.
 *
 *  2. IDEMPOTENCY — every provider retries. `provider_event_id` is UNIQUE in
 *     the database, so a replayed event fails the insert and is reported as
 *     already-processed instead of granting a second 30 days.
 *
 *  3. SERVER AUTHORITY — the payload says WHICH session succeeded, never what
 *     it bought. Amount, duration and target listing are read from the stored
 *     `pending` row, so a forged (but somehow correctly signed) payload cannot
 *     buy a year for one paisa.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceRole } from "@/lib/supabase/server";
import { selectPaymentProvider, WebhookVerificationError } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const provider = selectPaymentProvider();

  // Raw text, not req.json(). The signature covers the exact bytes sent; a
  // parse-then-reserialise round trip can change them.
  const rawBody = await req.text();

  let event;
  try {
    event = provider.verifyWebhook(rawBody, req.headers);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      // 400, not 401: nothing here is retryable by adding credentials, and a
      // 401 invites a provider to retry forever.
      console.warn(`[payments] webhook rejected: ${e.reason}`);
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    throw e;
  }

  const db = supabaseServiceRole();

  // Claim the event id first. UNIQUE on provider_event_id means a concurrent
  // or replayed delivery loses this race and takes the already-processed path
  // below, so fulfilment happens exactly once even under simultaneous retries.
  const { data: claimed, error: claimError } = await db
    .from("payments")
    .update({ provider_event_id: event.eventId })
    .eq("provider_session_id", event.sessionId)
    .eq("status", "pending")
    .is("provider_event_id", null)
    .select("id, opportunity_id, entitlement_days, company_id")
    .maybeSingle();

  if (claimError) {
    // A unique violation here IS the replay case, not a failure.
    if (claimError.code === "23505") {
      return NextResponse.json({ status: "already_processed" });
    }
    console.error("[payments] claim failed", claimError.message);
    return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  }

  if (!claimed) {
    // No pending row matched: either an unknown session, or one already
    // settled. Both are 200 — the provider did nothing wrong and must not be
    // told to retry.
    return NextResponse.json({ status: "no_pending_payment" });
  }

  if (event.outcome === "failed") {
    await db
      .from("payments")
      .update({
        status: "failed",
        failure_reason: event.failureReason ?? "provider_reported_failure",
        completed_at: new Date().toISOString(),
      })
      .eq("id", claimed.id);
    return NextResponse.json({ status: "failed_recorded" });
  }

  // ── fulfilment ────────────────────────────────────────────────────────
  // Duration comes from the stored row, never from the webhook payload.
  const until = new Date(
    Date.now() + claimed.entitlement_days * 24 * 60 * 60 * 1000
  ).toISOString();

  if (claimed.opportunity_id) {
    const { error: grantError } = await db
      .from("opportunities")
      .update({ featured_until: until })
      .eq("id", claimed.opportunity_id);

    if (grantError) {
      // Leave the payment pending so a retry can complete it. Marking it
      // succeeded here would record a purchase that delivered nothing.
      console.error("[payments] entitlement grant failed", grantError.message);
      return NextResponse.json({ error: "grant_failed" }, { status: 500 });
    }
  }

  await db
    .from("payments")
    .update({ status: "succeeded", completed_at: new Date().toISOString() })
    .eq("id", claimed.id);

  return NextResponse.json({
    status: "succeeded",
    featured_until: claimed.opportunity_id ? until : null,
  });
}
