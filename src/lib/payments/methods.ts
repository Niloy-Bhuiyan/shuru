/**
 * HOW SOMEONE CAN PAY — ALL OF IT A DEMONSTRATION.
 *
 * **NO METHOD IN THIS FILE MOVES REAL MONEY.** bKash, Nagad, Rocket and Card
 * are all sandbox paths. Nothing is charged, no wallet is debited, no card is
 * collected, and nobody should ever send money to anything this product
 * displays. Every screen that mentions a method says so.
 *
 * What is real is the *mechanism*. There are two settlement paths and both run
 * their full machinery:
 *
 *   provider_webhook — Card and Demo. A hosted checkout session, then an
 *                      HMAC-signed webhook carrying a unique event id, checked
 *                      by the same handler a production provider would hit.
 *                      Signature verification, idempotency and the
 *                      server-authoritative state transition are genuine code
 *                      on a genuine path.
 *
 *   manual_review    — bKash, Nagad and Rocket. The flow a great many
 *                      Bangladeshi merchants actually use: publish a number,
 *                      take the transaction id afterwards, and have a human
 *                      confirm it against the merchant statement. Here the
 *                      number is a placeholder and the transaction id is
 *                      whatever the demo user types — but the admin review
 *                      queue, the approval, and the entitlement it grants are
 *                      all real.
 *
 * ── The one rule that outlives the demo ───────────────────────────────────
 *
 * A credential is never collected. Not a card number, not a CVV, not a wallet
 * PIN, not an OTP — in demo mode or otherwise. The manual path asks only for a
 * transaction id, which is a receipt number. If a method cannot be implemented
 * without a PIN field, it does not go in this file.
 *
 * ── Upgrading to real money later ─────────────────────────────────────────
 *
 * `envVar` is kept so a deployment that has a genuine merchant number can set
 * it and stop being a demo, without a code change. `merchantNumber()` reports
 * which mode it is in, `payments.is_sandbox` is written from that, and the UI
 * reads it. Until one is set, every path is labelled a demo everywhere it
 * appears.
 */

export type PaymentMethodId = "bkash" | "nagad" | "rocket" | "card" | "demo";

export type Settlement = "provider_webhook" | "manual_review";

export type PaymentMethod = {
  id: PaymentMethodId;
  /** Shown as-is. These are brand names and are not translated. */
  label: string;
  settlement: Settlement;
  /** Which audience this is for, used to order the list sensibly. */
  region: "bd" | "international" | "any";
  /**
   * The env var that would hold a REAL receiving number. Unset means this
   * method runs as a demo, which is the default and the only mode this
   * deployment has ever been in.
   */
  envVar: string | null;
};

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  {
    id: "bkash",
    label: "bKash",
    settlement: "manual_review",
    region: "bd",
    envVar: "PAYMENT_MERCHANT_BKASH",
  },
  {
    id: "nagad",
    label: "Nagad",
    settlement: "manual_review",
    region: "bd",
    envVar: "PAYMENT_MERCHANT_NAGAD",
  },
  {
    id: "rocket",
    label: "Rocket",
    settlement: "manual_review",
    region: "bd",
    envVar: "PAYMENT_MERCHANT_ROCKET",
  },
  {
    // The path a payer outside Bangladesh would take. Prices stay in BDT
    // because that is the only currency this product quotes; a real gateway
    // would let the payer's own bank convert.
    id: "card",
    label: "Card",
    settlement: "provider_webhook",
    region: "international",
    envVar: null,
  },
  {
    id: "demo",
    label: "Demo",
    settlement: "provider_webhook",
    region: "any",
    envVar: null,
  },
] as const;

/**
 * Placeholder receiving numbers.
 *
 * Deliberately all zeros after the operator prefix. A plausible-looking number
 * is the dangerous choice here: someone could send real money to a stranger's
 * wallet. `01700000000` is not a number anybody holds, and it reads as a
 * placeholder at a glance to anyone who has used a Bangladeshi wallet.
 */
const DEMO_NUMBERS: Partial<Record<PaymentMethodId, string>> = {
  bkash: "01700000000",
  nagad: "01800000000",
  rocket: "01900000000",
};

export function methodById(id: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

export function isPaymentMethodId(v: unknown): v is PaymentMethodId {
  return typeof v === "string" && PAYMENT_METHODS.some((m) => m.id === v);
}

export type MerchantTarget = {
  number: string;
  /** True while no real merchant number is configured — i.e. always, today. */
  isDemo: boolean;
};

/**
 * Where a manual payment would be sent, and whether that is a real place.
 *
 * `isDemo` is the important half of the return value: it decides what the UI
 * says and what goes into `payments.is_sandbox`. A caller that reads `.number`
 * and ignores `.isDemo` is one refactor away from telling someone to send real
 * money to a placeholder.
 *
 * Server-side in effect — the env vars are not `NEXT_PUBLIC_`, so the number
 * reaches the browser through the checkout API response rather than the
 * JavaScript bundle.
 */
export function merchantNumber(method: PaymentMethod): MerchantTarget | null {
  if (method.settlement !== "manual_review") return null;

  const configured = method.envVar ? process.env[method.envVar] : undefined;
  if (configured && configured.trim()) {
    return { number: configured.trim(), isDemo: false };
  }

  const placeholder = DEMO_NUMBERS[method.id];
  return placeholder ? { number: placeholder, isDemo: true } : null;
}

export type MethodAvailability = {
  method: PaymentMethod;
  /**
   * Always true. Kept in the shape because the UI reads it, and because a
   * future method could genuinely be unavailable — but no method is switched
   * off today, which is the point: anyone opening the deployed link can walk
   * every path.
   */
  available: boolean;
  /** Where a manual payment is directed, and whether it is a placeholder. */
  merchantNumber: string | null;
  /** True when this method moves no money — true for every method today. */
  isDemo: boolean;
};

/** Every method, all of them usable, each saying whether it is a demo. */
export function methodAvailability(): MethodAvailability[] {
  return PAYMENT_METHODS.map((method) => {
    const target = merchantNumber(method);
    return {
      method,
      available: true,
      merchantNumber: target?.number ?? null,
      // A provider_webhook method runs the sandbox provider, which is a demo
      // by construction; a manual one is a demo until a real number is set.
      isDemo: target ? target.isDemo : true,
    };
  });
}

/**
 * A wallet transaction id, normalised, or null if it cannot be one.
 *
 * In demo mode this is whatever the user typed, so the check is deliberately
 * loose: any 6–32 character alphanumeric token. It exists to stop an empty
 * box, a pasted sentence, and anything long enough to be an attempt at
 * something other than a receipt number — not to validate a real TrxID, which
 * only the merchant statement can do.
 */
export function normaliseReference(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,32}$/.test(trimmed) ? trimmed : null;
}

/**
 * A Bangladeshi mobile number in local 11-digit form, or null.
 *
 * Optional on the submit form — a reviewer can work from the transaction id
 * alone — but when given it makes the match unambiguous, so it is worth
 * validating rather than storing whatever was typed.
 */
export function normaliseMsisdn(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s-]/g, "").replace(/^\+?880/, "0");
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}
