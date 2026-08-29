"use client";

/**
 * THE SUBSCRIBER'S OWN VIEW.
 *
 * Reads go straight to Postgres through the browser client, because RLS on
 * `subscriptions` and `payments` already restricts both to the owner — there
 * is nothing an API route in front of them would add except a hop.
 *
 * Writes do NOT. Starting a payment goes through `/api/subscription/checkout`,
 * because the price and the entitlement length must come from the server; see
 * that route for why a policy cannot enforce them.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type { BillingPeriod, Subscription } from "@/lib/subscription";
import type { PaymentMethodId } from "@/lib/payments/methods";

export type { Subscription };

/** One row of the payer's own history. */
export type PaymentRow = {
  id: string;
  purpose: "feature_listing" | "pro_subscription";
  method: PaymentMethodId;
  settlement: "provider_webhook" | "manual_review";
  amount_minor: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "expired";
  review_status: "pending" | "approved" | "rejected" | null;
  review_note: string | null;
  payer_reference: string | null;
  entitlement_days: number;
  is_sandbox: boolean;
  created_at: string;
  completed_at: string | null;
};

/**
 * The caller's subscription, or null.
 *
 * `maybeSingle()` with no filter: RLS narrows the table to at most the
 * caller's own row, so there is nothing to filter on. A thrown error would
 * strand the screen, so a failure reads as "no subscription" — the safe
 * direction, since it shows an upsell rather than granting anything.
 */
export async function getMySubscription(): Promise<Subscription | null> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("subscriptions")
    .select(
      "user_id, plan, status, current_period_start, current_period_end, source_payment_id"
    )
    .maybeSingle();
  if (error) return null;
  return (data as Subscription | null) ?? null;
}

/** The caller's own payments, newest first. */
export async function listMyPayments(): Promise<PaymentRow[]> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];

  const { data, error } = await sb
    .from("payments")
    .select(
      "id, purpose, method, settlement, amount_minor, currency, status, review_status, review_note, payer_reference, entitlement_days, is_sandbox, created_at, completed_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as PaymentRow[];
}

export type MethodInfo = {
  id: PaymentMethodId;
  label: string;
  settlement: "provider_webhook" | "manual_review";
  region: "bd" | "international" | "any";
  available: boolean;
  merchant_number: string | null;
  unconfigured_env_var: string | null;
};

export type Catalogue = {
  plans: Record<BillingPeriod, { period: BillingPeriod; price: { amountMinor: number; currency: string }; days: number }>;
  methods: MethodInfo[];
  provider: { provider: string; isSandbox: boolean; usingDefaultSigningSecret: boolean };
  notice: string;
};

/** What can be bought and how, including the merchant numbers. */
export async function getCatalogue(): Promise<Catalogue> {
  const res = await fetch("/api/subscription/checkout", { cache: "no-store" });
  if (!res.ok) throw new Error("catalogue_unavailable");
  return (await res.json()) as Catalogue;
}

export type CheckoutResult =
  | {
      status: "redirect";
      payment_id: string;
      redirect_url: string;
      is_sandbox: boolean;
      notice: string;
    }
  | {
      status: "awaiting_review";
      payment_id: string;
      merchant_number: string;
      notice: string;
    };

export class CheckoutFailed extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CheckoutFailed";
  }
}

/**
 * Start a purchase.
 *
 * The body carries only the two choices the buyer actually made. Anything that
 * decides what they get — price, duration, who is entitled — is filled in on
 * the server from the plan constant and the session.
 */
export async function startCheckout(input: {
  period: BillingPeriod;
  method: PaymentMethodId;
  payerReference?: string;
  payerMsisdn?: string;
}): Promise<CheckoutResult> {
  const res = await fetch("/api/subscription/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      period: input.period,
      method: input.method,
      payer_reference: input.payerReference,
      payer_msisdn: input.payerMsisdn,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new CheckoutFailed(
      typeof body.error === "string" ? body.error : "checkout_failed"
    );
  }
  return body as CheckoutResult;
}

/**
 * Drive a sandbox checkout to its outcome.
 *
 * Not a shortcut: it asks the server to deliver a properly signed webhook to
 * the real payment handler. Only the money is pretend — see
 * /api/payments/sandbox-confirm.
 */
export async function confirmSandbox(
  sessionId: string,
  outcome: "succeeded" | "failed"
): Promise<boolean> {
  const res = await fetch("/api/payments/sandbox-confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, outcome }),
  });
  return res.ok;
}
