/**
 * PAYMENT PROVIDER CONTRACT.
 *
 * Shaped after hosted-checkout providers (Stripe Checkout, SSLCommerz,
 * bKash Tokenized Checkout) because that is the shape that keeps card data out
 * of this application entirely: Shuru redirects the payer to the provider, the
 * provider takes the card, and the provider tells us what happened over a
 * signed webhook. **No implementation of this interface may ever accept a card
 * number, CVV or expiry.** If a provider needs those, it is the wrong provider.
 *
 * The only implementation today is `sandbox`, which moves no money. It exists
 * so the whole path — checkout, redirect, signed webhook, idempotent
 * fulfilment — is real and exercised, rather than a stub that flips a boolean
 * and calls it paid.
 */

/** What an employer can buy. One product today. */
export type PaymentPurpose = "feature_listing";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "expired";

/** Money in minor units. Never a float — see migration 0014. */
export type Money = {
  amountMinor: number;
  currency: string;
};

export type CheckoutRequest = {
  paymentId: string;
  companyId: string;
  opportunityId: string;
  purpose: PaymentPurpose;
  money: Money;
  /** Where the provider returns the payer once they are done. */
  returnUrl: string;
};

export type CheckoutSession = {
  /** The provider's id for this attempt. Stored, and echoed on the webhook. */
  sessionId: string;
  /** Where to send the payer's browser. */
  redirectUrl: string;
};

/**
 * A webhook that has been verified as genuinely from the provider.
 *
 * Construction of this type is the security boundary: a provider adapter must
 * only return one after checking the signature. Nothing downstream re-checks,
 * so `verifyWebhook` returning a value IS the assertion that the payload is
 * authentic.
 */
export type VerifiedEvent = {
  /** Unique per event. The idempotency key — see migration 0014. */
  eventId: string;
  sessionId: string;
  outcome: "succeeded" | "failed";
  failureReason?: string;
};

export class WebhookVerificationError extends Error {
  constructor(readonly reason: string) {
    super(`webhook_verification_failed:${reason}`);
    this.name = "WebhookVerificationError";
  }
}

export interface PaymentProvider {
  readonly name: string;

  /**
   * True when this provider moves no real money.
   *
   * Read by the UI and written to `payments.is_sandbox`. It is on the
   * interface rather than inferred from the name so that adding a real
   * provider forces an explicit answer.
   */
  readonly isSandbox: boolean;

  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;

  /**
   * Verify and parse a webhook.
   *
   * MUST throw `WebhookVerificationError` on a bad signature rather than
   * returning null — a caller that forgets to null-check would otherwise
   * fulfil an unauthenticated payment.
   */
  verifyWebhook(rawBody: string, headers: Headers): VerifiedEvent;
}

/** What the sandbox listing promotion costs and lasts. */
export const FEATURE_LISTING_PRICE: Money = {
  // 500.00 BDT in paisa. A plausible figure for a Bangladeshi employer, and
  // it is never charged.
  amountMinor: 50_000,
  currency: "BDT",
};

export const FEATURE_LISTING_DAYS = 30;
