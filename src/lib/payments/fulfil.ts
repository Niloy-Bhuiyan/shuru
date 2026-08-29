/**
 * FULFILMENT — the one place a paid payment becomes an entitlement.
 *
 * Two very different things settle a payment in this product: a signed webhook
 * from the checkout provider, and an admin confirming that mobile money
 * actually landed. They agree on nothing about *how* they decide, and they must
 * agree completely on *what happens next*, or the same purchase grants
 * different access depending on how it was paid.
 *
 * So neither of them writes an entitlement. They both call this.
 *
 * ── The invariant ─────────────────────────────────────────────────────────
 *
 * Everything here reads the STORED payment row. Nothing is taken from a
 * webhook payload or a request body: not the amount, not the duration, not
 * who is entitled. A caller passes a payment id and a client that can write;
 * this decides the rest. That is what makes a forged-but-somehow-signed
 * payload, or an admin with a mistyped form, unable to buy a decade for one
 * paisa.
 *
 * ── Renewal ───────────────────────────────────────────────────────────────
 *
 * A subscription is upserted, not inserted. Buying again while still inside a
 * paid period EXTENDS it (see `nextPeriodEnd`), so a renewal a week early does
 * not silently discard the week already paid for.
 *
 * Runs with a service-role client, which is the only role that may write
 * `subscriptions` at all — there is no RLS policy granting it to anyone else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { nextPeriodEnd, type Subscription } from "@/lib/subscription";

/** The stored payment fields fulfilment is allowed to look at. */
export type FulfilablePayment = {
  id: string;
  purpose: "feature_listing" | "pro_subscription";
  entitlement_days: number;
  opportunity_id: string | null;
  user_id: string | null;
};

export type FulfilResult =
  | { ok: true; kind: "feature_listing"; featuredUntil: string }
  | { ok: true; kind: "pro_subscription"; periodEnd: string }
  | { ok: true; kind: "nothing_to_grant" }
  | { ok: false; error: string };

/**
 * Grant what the payment bought.
 *
 * Deliberately does NOT mark the payment succeeded. The caller does that
 * afterwards, and only on `ok: true` — so a grant that fails leaves the
 * payment in a state a retry can still complete, rather than recording a
 * purchase that delivered nothing.
 */
export async function grantEntitlement(
  db: SupabaseClient,
  payment: FulfilablePayment,
  now: Date = new Date()
): Promise<FulfilResult> {
  if (payment.purpose === "feature_listing") {
    if (!payment.opportunity_id) {
      // The listing was deleted between checkout and settlement. Nothing to
      // promote, and nothing here can fix it — succeed so the payment stops
      // being retried, and leave the row for an operator to refund from.
      return { ok: true, kind: "nothing_to_grant" };
    }

    const until = new Date(
      now.getTime() + payment.entitlement_days * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error } = await db
      .from("opportunities")
      .update({ featured_until: until })
      .eq("id", payment.opportunity_id);

    if (error) return { ok: false, error: error.message };
    return { ok: true, kind: "feature_listing", featuredUntil: until };
  }

  // ── pro_subscription ────────────────────────────────────────────────────
  if (!payment.user_id) {
    // Barred by the `payments_one_payer` CHECK in migration 0018, so reaching
    // this means the constraint was dropped. Fail loudly rather than granting
    // a subscription to nobody.
    return { ok: false, error: "pro_subscription_without_user" };
  }

  const { data: existing, error: readError } = await db
    .from("subscriptions")
    .select(
      "user_id, plan, status, current_period_start, current_period_end, source_payment_id"
    )
    .eq("user_id", payment.user_id)
    .maybeSingle();

  // A failed READ must not become a fresh period. Extending is only correct
  // when we know what is already held; guessing "nothing" here would delete
  // time the subscriber paid for.
  if (readError) return { ok: false, error: readError.message };

  const current = (existing as Subscription | null) ?? null;
  const periodEnd = nextPeriodEnd(current, payment.entitlement_days, now);

  const { error: writeError } = await db.from("subscriptions").upsert(
    {
      user_id: payment.user_id,
      plan: "pro",
      status: "active",
      // Preserved across a renewal: this is when the subscriber first started
      // paying, and resetting it on every renewal throws that away.
      current_period_start: current?.current_period_start ?? now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      source_payment_id: payment.id,
    },
    { onConflict: "user_id" }
  );

  if (writeError) return { ok: false, error: writeError.message };
  return {
    ok: true,
    kind: "pro_subscription",
    periodEnd: periodEnd.toISOString(),
  };
}
