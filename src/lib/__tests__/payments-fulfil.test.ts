/**
 * FULFILMENT — the one code path both settlement routes share.
 *
 * The signed webhook and the admin approval route both call `grantEntitlement`
 * and neither writes an entitlement itself, so everything asserted here holds
 * for both. That is the reason this file exists: without it, "an approved
 * bKash transfer grants the same thing a card payment does" is a claim rather
 * than a test.
 *
 * The Supabase client is faked rather than mocked at the module level. What is
 * being tested is a decision — which row to write and with what dates — and a
 * fake that records the writes states that far more directly than assertions
 * about a mock's call arguments.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grantEntitlement,
  type FulfilablePayment,
} from "@/lib/payments/fulfil";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

type Write = { table: string; op: "update" | "upsert"; values: Record<string, unknown> };

/**
 * The narrow slice of the Supabase builder this module actually uses:
 * `.from().update().eq()`, `.from().select().eq().maybeSingle()` and
 * `.from().upsert()`. Anything else would be untested surface area pretending
 * to be coverage.
 */
function fakeDb(opts: {
  existingSubscription?: Record<string, unknown> | null;
  subscriptionReadError?: string;
  updateError?: string;
  upsertError?: string;
}) {
  const writes: Write[] = [];

  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          writes.push({ table, op: "update", values });
          return {
            eq: async () => ({
              error: opts.updateError ? { message: opts.updateError } : null,
            }),
          };
        },
        upsert(values: Record<string, unknown>) {
          writes.push({ table, op: "upsert", values });
          return Promise.resolve({
            error: opts.upsertError ? { message: opts.upsertError } : null,
          });
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: opts.existingSubscription ?? null,
                  error: opts.subscriptionReadError
                    ? { message: opts.subscriptionReadError }
                    : null,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, writes };
}

const listingPayment: FulfilablePayment = {
  id: "pay-1",
  purpose: "feature_listing",
  entitlement_days: 30,
  opportunity_id: "opp-1",
  user_id: null,
};

const proPayment: FulfilablePayment = {
  id: "pay-2",
  purpose: "pro_subscription",
  entitlement_days: 30,
  opportunity_id: null,
  user_id: "user-1",
};

describe("feature_listing", () => {
  it("promotes the listing for the stored number of days", () => {
    const { client, writes } = fakeDb({});
    return grantEntitlement(client, listingPayment, NOW).then((r) => {
      expect(r).toEqual({
        ok: true,
        kind: "feature_listing",
        featuredUntil: new Date(NOW.getTime() + 30 * DAY).toISOString(),
      });
      expect(writes).toEqual([
        {
          table: "opportunities",
          op: "update",
          values: { featured_until: new Date(NOW.getTime() + 30 * DAY).toISOString() },
        },
      ]);
    });
  });

  it("succeeds without writing when the listing has been deleted", async () => {
    // Nothing to promote and nothing here can fix it. Failing would make the
    // provider retry a webhook forever against a listing that is gone.
    const { client, writes } = fakeDb({});
    const r = await grantEntitlement(
      client,
      { ...listingPayment, opportunity_id: null },
      NOW
    );
    expect(r).toEqual({ ok: true, kind: "nothing_to_grant" });
    expect(writes).toHaveLength(0);
  });

  it("reports failure rather than claiming a promotion it did not write", async () => {
    const { client } = fakeDb({ updateError: "boom" });
    const r = await grantEntitlement(client, listingPayment, NOW);
    expect(r).toEqual({ ok: false, error: "boom" });
  });
});

describe("pro_subscription", () => {
  it("creates a period running from now on a first purchase", async () => {
    const { client, writes } = fakeDb({ existingSubscription: null });
    const r = await grantEntitlement(client, proPayment, NOW);

    expect(r).toEqual({
      ok: true,
      kind: "pro_subscription",
      periodEnd: "2026-07-01T00:00:00.000Z",
    });
    expect(writes).toEqual([
      {
        table: "subscriptions",
        op: "upsert",
        values: {
          user_id: "user-1",
          plan: "pro",
          status: "active",
          current_period_start: NOW.toISOString(),
          current_period_end: "2026-07-01T00:00:00.000Z",
          source_payment_id: "pay-2",
        },
      },
    ]);
  });

  it("EXTENDS an unexpired period and keeps the original start date", async () => {
    // Two properties in one: a renewal must not discard time already paid for,
    // and it must not reset "customer since" to today.
    const { client, writes } = fakeDb({
      existingSubscription: {
        user_id: "user-1",
        plan: "pro",
        status: "active",
        current_period_start: "2026-01-01T00:00:00.000Z",
        current_period_end: "2026-06-20T00:00:00.000Z",
        source_payment_id: "pay-old",
      },
    });

    const r = await grantEntitlement(client, proPayment, NOW);
    expect(r).toEqual({
      ok: true,
      kind: "pro_subscription",
      periodEnd: "2026-07-20T00:00:00.000Z",
    });
    expect(writes[0].values.current_period_start).toBe("2026-01-01T00:00:00.000Z");
  });

  it("restarts from now when the previous period has lapsed", async () => {
    const { client, writes } = fakeDb({
      existingSubscription: {
        user_id: "user-1",
        plan: "pro",
        status: "active",
        current_period_start: "2025-01-01T00:00:00.000Z",
        current_period_end: "2025-02-01T00:00:00.000Z",
        source_payment_id: null,
      },
    });
    await grantEntitlement(client, proPayment, NOW);
    expect(writes[0].values.current_period_end).toBe("2026-07-01T00:00:00.000Z");
  });

  it("reactivates a canceled subscription rather than leaving it canceled", async () => {
    const { client, writes } = fakeDb({
      existingSubscription: {
        user_id: "user-1",
        plan: "pro",
        status: "canceled",
        current_period_start: "2026-01-01T00:00:00.000Z",
        current_period_end: "2026-06-15T00:00:00.000Z",
        source_payment_id: null,
      },
    });
    await grantEntitlement(client, proPayment, NOW);
    expect(writes[0].values.status).toBe("active");
    // A canceled subscription is still entitled, so its remaining days are
    // extended rather than thrown away.
    expect(writes[0].values.current_period_end).toBe("2026-07-15T00:00:00.000Z");
  });

  it("refuses when the read of the existing subscription fails", async () => {
    // The dangerous alternative: treat a failed read as "no subscription" and
    // write a period starting today, silently deleting whatever was left.
    const { client, writes } = fakeDb({ subscriptionReadError: "timeout" });
    const r = await grantEntitlement(client, proPayment, NOW);
    expect(r).toEqual({ ok: false, error: "timeout" });
    expect(writes).toHaveLength(0);
  });

  it("refuses a subscription payment with no payer", async () => {
    // Barred by the payments_one_payer CHECK in 0018; reaching it means that
    // constraint is gone, and granting to nobody would be worse than failing.
    const { client } = fakeDb({});
    const r = await grantEntitlement(
      client,
      { ...proPayment, user_id: null },
      NOW
    );
    expect(r).toEqual({ ok: false, error: "pro_subscription_without_user" });
  });

  it("reports a failed write instead of claiming a grant", async () => {
    const { client } = fakeDb({ existingSubscription: null, upsertError: "denied" });
    const r = await grantEntitlement(client, proPayment, NOW);
    expect(r).toEqual({ ok: false, error: "denied" });
  });

  it("grants the yearly duration from the stored row, not from a constant", async () => {
    const { client, writes } = fakeDb({ existingSubscription: null });
    await grantEntitlement(client, { ...proPayment, entitlement_days: 365 }, NOW);
    expect(writes[0].values.current_period_end).toBe("2027-06-01T00:00:00.000Z");
  });
});
