/**
 * WHAT PRO IS, AND WHAT IT IS NOT.
 *
 * Pure module — no Supabase, no `next/headers`, no fetch. It states the plan
 * and answers "is this person entitled" from a row that has already been read.
 * Both the browser and the server import it, and it is the only place either
 * of them may decide what Pro costs or how long it lasts.
 *
 * ── The line the gating draws ──────────────────────────────────────────────
 *
 * Pro covers the three features that spend money on someone else's API every
 * time they are used: the agent, grounded listing Q&A, and the Forge's AI
 * rewriting. Nothing that Shuru computes itself is behind it — matching, the
 * Reality Check, eligibility, ATS scoring, résumé building and export, the
 * radar feed, saving, and the application pipeline all stay free and complete.
 *
 * That split is not a marketing choice, it is the only one that survives this
 * product's own rule. Shuru's claim is that its core decisions are
 * deterministic and explainable; charging for those would mean charging for
 * the honest part and giving away the part that can be wrong. It is also the
 * split a user can verify: every Pro feature is one that visibly calls a model.
 *
 * ── Mirrors SQL ───────────────────────────────────────────────────────────
 *
 * `isProActive` must agree with `public.is_pro()` in migration 0018. They are
 * two implementations of one rule, which is a drift risk taken deliberately:
 * the alternative is an RPC round trip on every render. The rule is three
 * lines long and both are tested. If you change one, change the other.
 */

export type BillingPeriod = "monthly" | "yearly";

export type Money = {
  /** Minor units — paisa. Integer, never a float. See migration 0014. */
  amountMinor: number;
  currency: string;
};

export type PlanOption = {
  period: BillingPeriod;
  price: Money;
  /** How much entitlement one purchase grants. */
  days: number;
};

/**
 * The catalogue. One plan, two billing periods.
 *
 * Priced in BDT because the merchant is in Bangladesh and every settlement
 * path lands in a BDT account — including the card path, where the payer's
 * own bank does the conversion. Quoting a second currency we do not actually
 * settle in would be a number we cannot stand behind.
 */
export const PRO_PLANS: Record<BillingPeriod, PlanOption> = {
  monthly: {
    period: "monthly",
    price: { amountMinor: 29_900, currency: "BDT" }, // ৳299
    days: 30,
  },
  yearly: {
    period: "yearly",
    // Two months off, stated as a real total rather than a "৳249/mo" that
    // nobody is ever charged.
    price: { amountMinor: 299_000, currency: "BDT" }, // ৳2,990
    days: 365,
  },
};

export function planFor(period: BillingPeriod): PlanOption {
  return PRO_PLANS[period];
}

/** Runtime narrowing for a value that arrived over the wire. */
export function isBillingPeriod(v: unknown): v is BillingPeriod {
  return v === "monthly" || v === "yearly";
}

/**
 * What Pro unlocks, as the server sees it.
 *
 * These identifiers are the contract between the route handlers that enforce
 * the gate and the screens that explain it. A feature that is not listed here
 * is free, and there is no default-deny: adding a gate means adding a name.
 */
export const PRO_FEATURES = [
  /** POST /api/agent — the tool-using assistant. */
  "agent",
  /** POST /api/ask — grounded answers about a listing, with citations. */
  "ask",
  /** POST /api/forge-section — AI section rewriting and JD tailoring. */
  "forge_ai",
] as const;

export type ProFeature = (typeof PRO_FEATURES)[number];

/** The row shape `subscriptions` returns. Mirrors migration 0018. */
export type Subscription = {
  user_id: string;
  plan: "pro";
  status: "active" | "expired" | "canceled";
  current_period_start: string;
  current_period_end: string;
  source_payment_id: string | null;
};

/**
 * Whether a subscription row entitles its owner right now.
 *
 * A CANCELED subscription is still entitled until the period runs out — the
 * money was taken for that period and cutting access the moment someone
 * cancels is taking it twice. Only 'expired' is immediately false; that state
 * exists for a subscription ended for cause, not by the subscriber.
 *
 * `null` means no row, which means never subscribed, which means not Pro.
 */
export function isProActive(
  sub: Subscription | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false;
  if (sub.status === "expired") return false;
  return new Date(sub.current_period_end).getTime() > now.getTime();
}

/**
 * When a purchase of `days` should end, given what the buyer already holds.
 *
 * Renewing before the current period runs out EXTENDS it rather than
 * restarting it. Starting from `now` in that case would silently delete the
 * remaining days the buyer had already paid for, which is the sort of quiet
 * loss nobody reports and everybody notices.
 */
export function nextPeriodEnd(
  current: Subscription | null | undefined,
  days: number,
  now: Date = new Date()
): Date {
  const base =
    current && isProActive(current, now)
      ? new Date(current.current_period_end)
      : now;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** ৳ 299.00 — for display. Minor units in, formatted string out. */
export function formatMoney({ amountMinor, currency }: Money): string {
  const major = (amountMinor / 100).toFixed(2);
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return currency === "BDT" ? `৳ ${grouped}` : `${currency} ${grouped}`;
}
