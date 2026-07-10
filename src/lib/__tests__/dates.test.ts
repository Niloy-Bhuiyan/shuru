/**
 * Deadline helpers. Focus on isEstimatedDeadline (1.3): only genuinely
 * ingested rows (synthetic posted+30d date, "Rolling · via <source>" label)
 * are flagged as estimates — curated rows never are, even when unverified.
 */
import { describe, expect, it } from "vitest";
import { daysLeft, isEstimatedDeadline } from "@/lib/dates";

describe("isEstimatedDeadline", () => {
  it("flags ingested remote rows (Rolling · via <source>, unverified)", () => {
    expect(
      isEstimatedDeadline({ cycle_label: "Rolling · via RemoteOK", is_verified: false })
    ).toBe(true);
    expect(
      isEstimatedDeadline({ cycle_label: "Rolling · via Arbeitnow", is_verified: false })
    ).toBe(true);
  });

  it("does NOT flag curated rows — verified or not", () => {
    // verified curated
    expect(
      isEstimatedDeadline({ cycle_label: "Nextern 2026", is_verified: true })
    ).toBe(false);
    // unverified curated (real cycle label, real curated deadline)
    expect(
      isEstimatedDeadline({ cycle_label: "Fall 2026", is_verified: false })
    ).toBe(false);
  });

  it("is defensive against a missing/empty cycle label", () => {
    expect(isEstimatedDeadline({ cycle_label: null, is_verified: false })).toBe(false);
    expect(isEstimatedDeadline({ is_verified: false })).toBe(false);
  });

  it("a verified row is never an estimate regardless of label", () => {
    expect(
      isEstimatedDeadline({ cycle_label: "Rolling · via RemoteOK", is_verified: true })
    ).toBe(false);
  });
});

describe("daysLeft", () => {
  it("counts full days until end of the deadline day", () => {
    const now = new Date(2026, 0, 1, 12, 0, 0); // 1 Jan 2026, noon
    expect(daysLeft("2026-01-01", now)).toBe(0);
    expect(daysLeft("2026-01-03", now)).toBe(2);
    expect(daysLeft("2025-12-31", now)).toBe(-1);
  });
});
