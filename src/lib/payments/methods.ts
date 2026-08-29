/**
 * HOW SOMEONE CAN PAY.
 *
 * Five methods, two settlement paths, one rule that overrides everything
 * below: **no method here ever collects a card number, a CVV, a wallet PIN or
 * an OTP.** The mobile-money methods collect a receipt number the payer
 * already has; the card method hands the payer to a hosted checkout. If a
 * method cannot be implemented without a PIN field, it does not go in this
 * file.
 *
 * ── Why bKash / Nagad / Rocket settle by human review ──────────────────────
 *
 * bKash Tokenized Checkout and the Nagad merchant API both require merchant
 * credentials issued after a business KYC. Without them, the choice is not
 * "API vs. manual" — it is "manual, or a screen that asks for a wallet PIN and
 * pretends". The second is how wallets get drained, and no product deadline
 * makes it acceptable.
 *
 * So Shuru does what most small Bangladeshi merchants genuinely do: publish a
 * merchant number, let the payer Send Money from their own wallet app where
 * their PIN never leaves bKash, and take the transaction id afterwards. An
 * admin matches it against the merchant statement before anything is granted.
 * Slower than an API, and completely real.
 *
 * ── Why the merchant number is configuration ───────────────────────────────
 *
 * A hardcoded number would be either someone's real wallet or a fake one shown
 * to a payer about to send money. Both are unacceptable, so each mobile method
 * is available only while its number is configured, and reports itself as
 * unconfigured otherwise rather than quietly disappearing — an operator should
 * be told which variable to set, not left wondering where bKash went.
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
   * The env var holding the receiving number. Only mobile methods have one;
   * `null` means the method needs no operator configuration.
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
    // Cards are the path for payers outside Bangladesh. The amount is still
    // charged in BDT — the merchant account is a BDT account — and the payer's
    // own bank does the conversion. Quoting a converted figure we do not
    // control would be inventing a number.
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

export function methodById(id: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

export function isPaymentMethodId(v: unknown): v is PaymentMethodId {
  return typeof v === "string" && PAYMENT_METHODS.some((m) => m.id === v);
}

/**
 * The receiving number for a mobile method, or null.
 *
 * Server-only in effect: these variables are not `NEXT_PUBLIC_`, so in the
 * browser every lookup returns null. That is intentional — the number reaches
 * the payer through the checkout API response, which means it is served to a
 * signed-in user rather than baked into the JavaScript bundle for scrapers.
 */
export function merchantNumber(method: PaymentMethod): string | null {
  if (!method.envVar) return null;
  const raw = process.env[method.envVar];
  return raw && raw.trim() ? raw.trim() : null;
}

export type MethodAvailability = {
  method: PaymentMethod;
  available: boolean;
  /** Present only for an available manual method. */
  merchantNumber: string | null;
  /** Set when `available` is false — names the variable an operator must set. */
  unconfiguredEnvVar: string | null;
};

/**
 * Every method with whether it can actually be used right now.
 *
 * Returns unavailable methods rather than filtering them out. A payer seeing
 * "bKash — not enabled yet" learns something true; a payer seeing no bKash at
 * all in a Bangladeshi product assumes the page is broken.
 */
export function methodAvailability(): MethodAvailability[] {
  return PAYMENT_METHODS.map((method) => {
    if (method.settlement === "provider_webhook") {
      return {
        method,
        available: true,
        merchantNumber: null,
        unconfiguredEnvVar: null,
      };
    }
    const number = merchantNumber(method);
    return {
      method,
      available: Boolean(number),
      merchantNumber: number,
      unconfiguredEnvVar: number ? null : method.envVar,
    };
  });
}

/**
 * A wallet transaction id, normalised, or null if it cannot be one.
 *
 * bKash TrxIDs are 10 alphanumeric characters; Nagad and Rocket are longer and
 * differently shaped. Rather than encode three formats that will change, this
 * accepts any 6–32 character alphanumeric token and rejects everything else.
 * The real check is a human against the merchant statement — this only stops
 * an empty box, a pasted sentence, and anything long enough to be an attempt
 * at something other than a receipt number.
 */
export function normaliseReference(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,32}$/.test(trimmed) ? trimmed : null;
}

/**
 * A Bangladeshi mobile number in local 11-digit form, or null.
 *
 * Optional on the submit form — an admin can usually find a transaction from
 * the id alone — but when given it makes the match unambiguous, so it is worth
 * validating rather than storing whatever was typed.
 */
export function normaliseMsisdn(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s-]/g, "").replace(/^\+?880/, "0");
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}
