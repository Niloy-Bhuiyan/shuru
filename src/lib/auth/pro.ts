/**
 * THE PRO GATE, SERVER SIDE.
 *
 * Every route that spends money on a model call goes through `requirePro`
 * before it does anything else. The client-side equivalent — the padlock on a
 * button, the upsell card — is a courtesy that keeps a user from walking into
 * a wall. This is the part that actually holds.
 *
 * Read through the CALLER'S session, not the service role. RLS on
 * `subscriptions` already restricts the table to the owner and to admins, so
 * a session read is both sufficient and self-limiting: a bug here cannot leak
 * another person's billing state, because the database will not return it.
 *
 * Server-only by construction — `supabaseServer()` reads `next/headers`.
 */

import { supabaseServer } from "@/lib/supabase/server";
import { AuthError, requireUser, type SessionUser } from "./session";
import { isProActive, type ProFeature, type Subscription } from "@/lib/subscription";

/** The caller's subscription row, or null if they have never bought one. */
export async function getSubscription(): Promise<Subscription | null> {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("subscriptions")
    .select(
      "user_id, plan, status, current_period_start, current_period_end, source_payment_id"
    )
    .maybeSingle();

  // A read failure is not an entitlement. Returning null degrades to "not
  // Pro", which is the safe direction: the user sees an upsell instead of
  // silently getting a paid feature because a query timed out.
  if (error) return null;
  return (data as Subscription | null) ?? null;
}

export type ProAccess = {
  user: SessionUser;
  subscription: Subscription | null;
  isPro: boolean;
  /** True when access comes from the admin role rather than from a payment. */
  viaAdmin: boolean;
};

/**
 * Whether the caller may use a Pro feature, without throwing.
 *
 * Admins pass. That is the same rule `requireRole` already applies everywhere
 * else in this codebase — an admin satisfies every requirement — and an
 * operator who has to buy a subscription to reproduce a bug report will
 * instead reproduce it in someone else's account. `viaAdmin` records which
 * reason applied so nothing downstream mistakes an operator for a customer,
 * and so revenue reporting never counts one.
 */
export async function proAccess(): Promise<ProAccess> {
  const user = await requireUser();
  if (user.role === "admin") {
    return { user, subscription: null, isPro: true, viaAdmin: true };
  }
  const subscription = await getSubscription();
  return {
    user,
    subscription,
    isPro: isProActive(subscription),
    viaAdmin: false,
  };
}

export class ProRequiredError extends AuthError {
  constructor(readonly feature: ProFeature) {
    super(`Shuru Pro is required for: ${feature}`, 402);
    this.name = "ProRequiredError";
  }
}

/**
 * The caller, or a 402 naming the feature they hit.
 *
 * 402 rather than 403 on purpose: the client renders an upgrade path from it,
 * and a 403 would tell it there is nothing to offer. `feature` is echoed so
 * the screen can say which capability was refused instead of a generic
 * "upgrade to continue" that leaves the user guessing what they did.
 */
export async function requirePro(feature: ProFeature): Promise<ProAccess> {
  const access = await proAccess();
  if (!access.isPro) throw new ProRequiredError(feature);
  return access;
}

/**
 * The 402 body, in the one shape every Pro-gated route returns.
 *
 * Route handlers call `authErrorResponse` for 401 and 403 and get a bare
 * `{ error }`. A 402 needs more than that — the client has to know which
 * feature was blocked and where to go — so it is built here rather than
 * assembled slightly differently in three route files.
 */
export function proRequiredResponse(err: unknown): Response | null {
  if (!(err instanceof ProRequiredError)) return null;
  return Response.json(
    {
      error: err.message,
      code: "pro_required",
      feature: err.feature,
      upgrade_url: "/pro",
    },
    { status: 402 }
  );
}
