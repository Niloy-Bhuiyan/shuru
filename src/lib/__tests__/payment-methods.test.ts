/**
 * Payment method catalogue and the two input normalisers.
 *
 * The load-bearing assertion in this file is that EVERY method reports itself
 * as a demo out of the box. `payments.is_sandbox` is written from `isDemo`, and
 * the UI decides from it whether to tell someone money is moving — so a
 * regression here is not a cosmetic one, it is a screen that quietly implies a
 * real charge.
 *
 * The settlement assignments matter for a second reason: bKash, Nagad and
 * Rocket settle by human review rather than automatically, because settling
 * them automatically would need merchant API credentials, and the shortcut for
 * not having those is a PIN field.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  isPaymentMethodId,
  merchantNumber,
  methodAvailability,
  methodById,
  normaliseMsisdn,
  normaliseReference,
  PAYMENT_METHODS,
} from "@/lib/payments/methods";

const ENV_KEYS = [
  "PAYMENT_MERCHANT_BKASH",
  "PAYMENT_MERCHANT_NAGAD",
  "PAYMENT_MERCHANT_ROCKET",
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("the method catalogue", () => {
  it("settles every mobile wallet by human review, never automatically", () => {
    for (const id of ["bkash", "nagad", "rocket"] as const) {
      expect(methodById(id)?.settlement).toBe("manual_review");
    }
  });

  it("gives every manual method a configuration variable and no other method one", () => {
    for (const m of PAYMENT_METHODS) {
      if (m.settlement === "manual_review") {
        expect(m.envVar, `${m.id} needs a merchant number variable`).toBeTruthy();
      } else {
        expect(m.envVar, `${m.id} should need no configuration`).toBeNull();
      }
    }
  });

  it("narrows a method id arriving over the wire", () => {
    expect(isPaymentMethodId("bkash")).toBe(true);
    expect(isPaymentMethodId("paypal")).toBe(false);
    expect(isPaymentMethodId(null)).toBe(false);
  });
});

describe("availability", () => {
  it("marks EVERY method a demo when nothing is configured", () => {
    // The default state, and the deployed one. If any of these flips to false
    // without a real merchant number behind it, a screen starts implying a
    // charge that does not happen.
    for (const m of methodAvailability()) {
      expect(m.isDemo, `${m.method.id} should be a demo`).toBe(true);
    }
  });

  it("leaves every method usable, so the whole flow is walkable", () => {
    for (const m of methodAvailability()) {
      expect(m.available, `${m.method.id} should be usable`).toBe(true);
    }
    expect(methodAvailability()).toHaveLength(PAYMENT_METHODS.length);
  });

  it("gives each wallet a placeholder number that nobody could hold", () => {
    for (const id of ["bkash", "nagad", "rocket"] as const) {
      const m = methodAvailability().find((x) => x.method.id === id)!;
      expect(m.merchantNumber).toMatch(/^01[3-9]0{8}$/);
    }
  });

  it("stops being a demo once a real merchant number is configured", () => {
    // The upgrade path: setting the variable is the whole change, and
    // is_sandbox follows it without anyone editing the checkout route.
    process.env.PAYMENT_MERCHANT_BKASH = " 01712345678 ";
    const bkash = methodAvailability().find((m) => m.method.id === "bkash")!;
    expect(bkash.merchantNumber).toBe("01712345678");
    expect(bkash.isDemo).toBe(false);
    // The others are untouched by one wallet being configured.
    expect(
      methodAvailability().find((m) => m.method.id === "nagad")!.isDemo
    ).toBe(true);
  });

  it("treats a blank variable as unset and stays a demo", () => {
    process.env.PAYMENT_MERCHANT_NAGAD = "   ";
    const nagad = merchantNumber(methodById("nagad")!);
    expect(nagad?.isDemo).toBe(true);
  });

  it("has no merchant target for the webhook methods", () => {
    // Card and Demo are redirected to a hosted checkout; there is nowhere to
    // send money to, and offering a number would be meaningless.
    for (const id of ["card", "demo"] as const) {
      expect(merchantNumber(methodById(id)!)).toBeNull();
    }
  });
});

describe("normaliseReference", () => {
  it("accepts and upper-cases a plausible transaction id", () => {
    expect(normaliseReference(" 9fx7ab21kd ")).toBe("9FX7AB21KD");
  });

  it("accepts the bounds of the accepted length", () => {
    expect(normaliseReference("A1B2C3")).toBe("A1B2C3");
    expect(normaliseReference("A".repeat(32))).toBe("A".repeat(32));
  });

  it("rejects anything that cannot be a receipt number", () => {
    expect(normaliseReference("")).toBeNull();
    expect(normaliseReference("SHORT")).toBeNull(); // 5 chars
    expect(normaliseReference("A".repeat(33))).toBeNull();
    expect(normaliseReference("has spaces")).toBeNull();
    expect(normaliseReference("drop table payments;")).toBeNull();
    expect(normaliseReference(12345678)).toBeNull();
    expect(normaliseReference(null)).toBeNull();
  });
});

describe("normaliseMsisdn", () => {
  it("accepts the local 11-digit form", () => {
    expect(normaliseMsisdn("01712345678")).toBe("01712345678");
  });

  it("converts the +880 and 880 international forms to local", () => {
    expect(normaliseMsisdn("+8801712345678")).toBe("01712345678");
    expect(normaliseMsisdn("8801912345678")).toBe("01912345678");
  });

  it("tolerates spaces and dashes", () => {
    expect(normaliseMsisdn("017-1234 5678")).toBe("01712345678");
  });

  it("rejects a number that is not a Bangladeshi mobile", () => {
    expect(normaliseMsisdn("0121234567")).toBeNull(); // operator 2, and short
    expect(normaliseMsisdn("0171234567")).toBeNull(); // 10 digits
    expect(normaliseMsisdn("017123456789")).toBeNull(); // 12 digits
    expect(normaliseMsisdn("not a number")).toBeNull();
    expect(normaliseMsisdn(undefined)).toBeNull();
  });
});
