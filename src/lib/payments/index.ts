import { sandboxProvider, signingSecretIsDefault } from "./sandbox";
import type { PaymentProvider } from "./types";

/**
 * Provider selection.
 *
 * One provider today. `PAYMENT_PROVIDER` exists so adding a real one is a
 * config change plus one `case`, not a refactor of every caller.
 *
 * There is no "none" branch: payments are a labelled sandbox demonstration and
 * are always available in that form. What must never happen is a *real*
 * provider silently falling back to sandbox — so an unrecognised value throws
 * rather than defaulting.
 */
export function selectPaymentProvider(): PaymentProvider {
  const configured = (process.env.PAYMENT_PROVIDER || "sandbox").toLowerCase();
  switch (configured) {
    case "sandbox":
      return sandboxProvider;
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${configured}". Only 'sandbox' is implemented.`
      );
  }
}

/**
 * Everything the UI needs to describe the payment situation truthfully.
 *
 * `isSandbox` drives an unmissable banner. `signingSecretIsDefault` is
 * surfaced separately because a signature verified against a published
 * constant is not a security property, and the operator should be told so
 * rather than reassured by the word "verified".
 */
export function paymentStatus() {
  const provider = selectPaymentProvider();
  return {
    provider: provider.name,
    isSandbox: provider.isSandbox,
    usingDefaultSigningSecret: signingSecretIsDefault(),
  };
}

export * from "./types";
