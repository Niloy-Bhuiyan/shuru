"use client";

/**
 * The signed-in user's Pro entitlement, for the UI only.
 *
 * Same standing as `useRole`: this decides whether a button shows a padlock,
 * never whether a request is allowed. Every Pro feature is gated again by
 * `requirePro()` in its route handler, and `subscriptions` has no write policy
 * for anyone — a user who forces this to `true` in devtools gets a nicer
 * looking button and a 402.
 *
 * Fails CLOSED. A failed lookup reports "not Pro", so the worst case is an
 * upsell shown to someone who already paid — recoverable in one reload —
 * rather than a Pro surface that dead-ends on a server refusal.
 */

import { useCallback, useEffect, useState } from "react";
import { getMySubscription } from "@/lib/data/subscription";
import { isProActive, type Subscription } from "@/lib/subscription";
import { useRole } from "./useRole";

export type ProState = {
  isPro: boolean;
  subscription: Subscription | null;
  loading: boolean;
  /** Access comes from the admin role, not from a payment. Mirrors lib/auth/pro.ts. */
  viaAdmin: boolean;
  /** Re-read after a purchase completes. */
  refresh: () => void;
};

export function usePro(): ProState {
  const { role, loading: roleLoading } = useRole();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getMySubscription()
      .then((s) => {
        if (!cancelled) setSubscription(s);
      })
      .catch(() => {
        if (!cancelled) setSubscription(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const viaAdmin = role === "admin";

  return {
    isPro: viaAdmin || isProActive(subscription),
    subscription,
    loading: loading || roleLoading,
    viaAdmin,
    refresh,
  };
}
