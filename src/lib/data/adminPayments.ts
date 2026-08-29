"use client";

/**
 * THE ADMIN'S TRANSACTION QUEUE.
 *
 * Reads go through RLS — `payments_select` returns everything to an admin and
 * nothing extra to anyone else, so this module needs no role check of its own
 * to be safe; a non-admin calling `listPaymentsForReview` gets an empty array.
 *
 * The DECISION does not go through RLS, because there is no policy that would
 * let it: `subscriptions` is writable only by the service role. Approving
 * posts to /api/admin/payments/decide, which re-checks the role server-side
 * and grants through the same code path the webhook uses.
 *
 * ── What a reviewer is deliberately not shown ─────────────────────────────
 *
 * No name, no university, no email. `profiles` is own-row-only in this schema
 * and this feature is not a reason to weaken that. It also is not needed: the
 * job is to find one line in a bKash merchant statement, and a statement lists
 * the sending number and the transaction id, not the sender's name. Reviewing
 * a transaction rather than a person is both the smaller privilege and the
 * more accurate description of the work.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type { PaymentMethodId } from "@/lib/payments/methods";

export type ReviewablePayment = {
  id: string;
  user_id: string | null;
  purpose: "feature_listing" | "pro_subscription";
  method: PaymentMethodId;
  settlement: "provider_webhook" | "manual_review";
  amount_minor: number;
  currency: string;
  entitlement_days: number;
  status: "pending" | "succeeded" | "failed" | "expired";
  review_status: "pending" | "approved" | "rejected" | null;
  review_note: string | null;
  reviewed_at: string | null;
  payer_reference: string | null;
  payer_msisdn: string | null;
  is_sandbox: boolean;
  created_at: string;
};

const COLUMNS =
  "id, user_id, purpose, method, settlement, amount_minor, currency, entitlement_days, status, review_status, review_note, reviewed_at, payer_reference, payer_msisdn, is_sandbox, created_at";

/**
 * Mobile-money payments in a given review state, oldest first.
 *
 * Oldest first on purpose, and it is the opposite of every other list in this
 * product: someone is waiting for money they already sent, so the queue is
 * worked front to back rather than showing the newest arrival on top.
 */
export async function listPaymentsForReview(
  reviewStatus: "pending" | "approved" | "rejected"
): Promise<ReviewablePayment[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("payments")
    .select(COLUMNS)
    .eq("settlement", "manual_review")
    .eq("review_status", reviewStatus)
    .order("created_at", { ascending: reviewStatus === "pending" })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as ReviewablePayment[];
}

/** Everything that settled itself, for the ledger view. Newest first. */
export async function listAutomaticPayments(): Promise<ReviewablePayment[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("payments")
    .select(COLUMNS)
    .eq("settlement", "provider_webhook")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as ReviewablePayment[];
}

export class DecisionRejected extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DecisionRejected";
  }
}

/**
 * Approve or reject one transaction.
 *
 * A rejection requires a reason and the server enforces it too — the payer
 * reads this text, and "rejected" with no explanation is indistinguishable
 * from their money disappearing.
 */
export async function decidePayment(
  paymentId: string,
  approve: boolean,
  note?: string
): Promise<void> {
  const res = await fetch("/api/admin/payments/decide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payment_id: paymentId, approve, note }),
  });

  if (res.ok) return;

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const code = body.error ?? "decision_failed";
  throw new DecisionRejected(code, MESSAGES[code] ?? code);
}

/**
 * Server error codes turned into something a reviewer can act on.
 *
 * Kept here rather than in the i18n dictionary because each one names a
 * specific server-side refusal; a translated generic would lose which rule
 * fired, and these are read by operators rather than by students.
 */
const MESSAGES: Record<string, string> = {
  cannot_review_own_payment:
    "You cannot approve your own payment. Ask another admin to review it.",
  already_reviewed: "Another admin already decided this one. Reload the queue.",
  not_a_manual_payment:
    "This payment settles through its provider and cannot be approved by hand.",
  reason_required: "A rejection needs a reason — the payer is shown it.",
  grant_failed:
    "The payment was not approved: granting the subscription failed, so nothing was changed.",
  payment_not_found: "That payment no longer exists.",
};
