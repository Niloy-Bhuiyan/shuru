/**
 * Payment method catalogue and the two input normalisers.
 *
 * The normalisers are the only validation between a text box and a row an
 * admin will later act on, so their job is narrow and worth pinning: reject
 * anything that cannot be a receipt number, and never mangle one that can.
 *
 * The catalogue assertions exist because the entries encode a security rule —
 * bKash, Nagad and Rocket MUST settle by human review, because settling them
 * automatically would mean holding merchant API credentials this deployment
 * does not have, and the shortcut for that is a PIN field.
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
  it("marks a wallet unavailable until its merchant number is configured", () => {
    const bkash = methodAvailability().find((m) => m.method.id === "bkash")!;
    expect(bkash.available).toBe(false);
    expect(bkash.merchantNumber).toBeNull();
    // The operator is told exactly which variable to set, rather than the
    // method silently vanishing from the page.
    expect(bkash.unconfiguredEnvVar).toBe("PAYMENT_MERCHANT_BKASH");
  });

  it("publishes the number once it is set", () => {
    process.env.PAYMENT_MERCHANT_BKASH = " 01712345678 ";
    const bkash = methodAvailability().find((m) => m.method.id === "bkash")!;
    expect(bkash.available).toBe(true);
    expect(bkash.merchantNumber).toBe("01712345678");
    expect(bkash.unconfiguredEnvVar).toBeNull();
  });

  it("treats a blank variable as unset", () => {
    process.env.PAYMENT_MERCHANT_NAGAD = "   ";
    expect(merchantNumber(methodById("nagad")!)).toBeNull();
  });

  it("keeps the sandbox paths always usable", () => {
    // The demo and card paths need no operator configuration, which is what
    // lets anyone open the deployed link and walk the full payment flow.
    for (const id of ["card", "demo"] as const) {
      const m = methodAvailability().find((x) => x.method.id === id)!;
      expect(m.available).toBe(true);
    }
  });

  it("returns unavailable methods rather than hiding them", () => {
    expect(methodAvailability()).toHaveLength(PAYMENT_METHODS.length);
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
