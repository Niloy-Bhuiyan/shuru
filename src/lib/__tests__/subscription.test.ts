/**
 * Entitlement arithmetic.
 *
 * These functions decide whether someone keeps access they paid for and how
 * much time a purchase adds. Both failure directions are bad in a way nobody
 * reports: granting access that was not bought is revenue lost silently, and
 * discarding days that were bought is a customer quietly robbed.
 *
 * `isProActive` also has to stay in step with `public.is_pro()` in migration
 * 0018 — two implementations of one rule. The cases below are written to match
 * that SQL clause for clause.
 */
import { describe, expect, it } from "vitest";
import {
  formatMoney,
  isBillingPeriod,
  isProActive,
  nextPeriodEnd,
  planFor,
  PRO_FEATURES,
  PRO_PLANS,
  type Subscription,
} from "@/lib/subscription";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    user_id: "u1",
    plan: "pro",
    status: "active",
    current_period_start: "2026-05-01T00:00:00.000Z",
    current_period_end: "2026-07-01T00:00:00.000Z",
    source_payment_id: null,
    ...over,
  };
}

describe("isProActive", () => {
  it("is false with no subscription at all", () => {
    expect(isProActive(null, NOW)).toBe(false);
    expect(isProActive(undefined, NOW)).toBe(false);
  });

  it("is true inside an active paid period", () => {
    expect(isProActive(sub(), NOW)).toBe(true);
  });

  it("is false once the period has passed", () => {
    expect(
      isProActive(sub({ current_period_end: "2026-05-30T00:00:00.000Z" }), NOW)
    ).toBe(false);
  });

  it("keeps a CANCELED subscription entitled to the end of the paid period", () => {
    // The money was taken for this period. Cutting access at the moment of
    // cancellation charges for time that is then not delivered.
    expect(isProActive(sub({ status: "canceled" }), NOW)).toBe(true);
  });

  it("does not entitle a canceled subscription past its period", () => {
    expect(
      isProActive(
        sub({ status: "canceled", current_period_end: "2026-05-01T00:00:00.000Z" }),
        NOW
      )
    ).toBe(false);
  });

  it("is false for 'expired' even while the period is still in the future", () => {
    // 'expired' is the state for a subscription ended for cause, so it has to
    // beat the date rather than wait for it.
    expect(isProActive(sub({ status: "expired" }), NOW)).toBe(false);
  });

  it("treats the exact expiry instant as over", () => {
    expect(
      isProActive(sub({ current_period_end: NOW.toISOString() }), NOW)
    ).toBe(false);
  });
});

describe("nextPeriodEnd", () => {
  it("starts from now for a first purchase", () => {
    expect(nextPeriodEnd(null, 30, NOW).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z"
    );
  });

  it("EXTENDS an unexpired period instead of restarting it", () => {
    // Renewing early must not delete the month already paid for. This is the
    // regression that matters most in this file.
    const current = sub({ current_period_end: "2026-07-01T00:00:00.000Z" });
    expect(nextPeriodEnd(current, 30, NOW).toISOString()).toBe(
      "2026-07-31T00:00:00.000Z"
    );
  });

  it("starts from now when the previous period has already lapsed", () => {
    const lapsed = sub({ current_period_end: "2026-01-01T00:00:00.000Z" });
    expect(nextPeriodEnd(lapsed, 30, NOW).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z"
    );
  });

  it("does not extend from an expired subscription's leftover date", () => {
    // 'expired' is not entitled, so its end date must not be used as a base —
    // that would hand back time the subscription was ended for.
    const expired = sub({
      status: "expired",
      current_period_end: "2026-12-01T00:00:00.000Z",
    });
    expect(nextPeriodEnd(expired, 30, NOW).toISOString()).toBe(
      "2026-07-01T00:00:00.000Z"
    );
  });

  it("adds a full year for the yearly plan", () => {
    expect(nextPeriodEnd(null, PRO_PLANS.yearly.days, NOW).toISOString()).toBe(
      "2027-06-01T00:00:00.000Z"
    );
  });
});

describe("the plan catalogue", () => {
  it("prices every period in integer minor units", () => {
    for (const p of Object.values(PRO_PLANS)) {
      expect(Number.isInteger(p.price.amountMinor)).toBe(true);
      expect(p.price.amountMinor).toBeGreaterThan(0);
      expect(p.price.currency).toMatch(/^[A-Z]{3}$/);
      expect(p.days).toBeGreaterThan(0);
    }
  });

  it("makes the yearly plan genuinely cheaper per day than monthly", () => {
    // The UI claims a saving. If this ever fails, the claim is a lie.
    const monthly = PRO_PLANS.monthly;
    const yearly = PRO_PLANS.yearly;
    expect(yearly.price.amountMinor / yearly.days).toBeLessThan(
      monthly.price.amountMinor / monthly.days
    );
  });

  it("narrows a billing period arriving over the wire", () => {
    expect(isBillingPeriod("monthly")).toBe(true);
    expect(isBillingPeriod("yearly")).toBe(true);
    expect(isBillingPeriod("lifetime")).toBe(false);
    expect(isBillingPeriod(undefined)).toBe(false);
    expect(isBillingPeriod(12)).toBe(false);
  });

  it("resolves each period to its own plan", () => {
    expect(planFor("monthly")).toBe(PRO_PLANS.monthly);
    expect(planFor("yearly")).toBe(PRO_PLANS.yearly);
  });

  it("gates only the features that call a model", () => {
    // A silent addition to this list takes something away from every free
    // user, so the list is asserted exactly rather than by length.
    expect([...PRO_FEATURES]).toEqual(["agent", "ask", "forge_ai"]);
  });
});

describe("formatMoney", () => {
  it("renders BDT minor units with a taka sign and two decimals", () => {
    expect(formatMoney({ amountMinor: 29_900, currency: "BDT" })).toBe("৳ 299.00");
  });

  it("groups thousands", () => {
    expect(formatMoney({ amountMinor: 299_000, currency: "BDT" })).toBe(
      "৳ 2,990.00"
    );
  });

  it("falls back to the code for a currency with no symbol here", () => {
    expect(formatMoney({ amountMinor: 1_050, currency: "USD" })).toBe("USD 10.50");
  });
});
