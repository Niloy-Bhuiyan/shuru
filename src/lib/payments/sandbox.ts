import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  VerifiedEvent,
} from "./types";
import { WebhookVerificationError } from "./types";

/**
 * SANDBOX PAYMENT PROVIDER — MOVES NO MONEY.
 *
 * This is a labelled demonstration provider, not a payment processor. Nothing
 * it does results in a charge, and it must never be presented as if it did.
 *
 * What it is for: exercising the *whole* payment path for real. It issues a
 * checkout session, redirects the payer to a page that says in plain language
 * that no money moves, and then delivers an **HMAC-signed webhook** through
 * exactly the same handler a production provider would use. The signature
 * check, the idempotency key and the server-authoritative state transition are
 * therefore all real code on a real path — the only pretend part is the money.
 *
 * The alternative, a stub that flips `status` to 'succeeded' directly, would
 * leave the three things most likely to be wrong in production completely
 * untested.
 *
 * Swapping in a real provider means implementing this same interface and
 * changing `select()` in ./index. No caller changes.
 */

const SIGNATURE_HEADER = "x-shuru-sandbox-signature";
const EVENT_HEADER = "x-shuru-sandbox-event-id";

/**
 * The signing secret.
 *
 * Falls back to a fixed development value ONLY when unset, so a fresh clone
 * can exercise the flow. `signingSecretIsDefault()` reports that, and the UI
 * and docs say so — a "verified" signature checked against a public constant
 * is not a security property and must not be described as one.
 */
const DEV_SECRET = "shuru-sandbox-development-signing-key";

function secret(): string {
  return process.env.SANDBOX_PAYMENT_SIGNING_SECRET || DEV_SECRET;
}

export function signingSecretIsDefault(): boolean {
  return !process.env.SANDBOX_PAYMENT_SIGNING_SECRET;
}

/** The signature a genuine sandbox webhook carries. Exported for the emitter. */
export function signPayload(rawBody: string): string {
  return createHmac("sha256", secret()).update(rawBody, "utf8").digest("hex");
}

function signaturesMatch(a: string, b: string): boolean {
  // Both are hex digests of fixed width, so a length check here is not a leak.
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    // Non-hex input throws in Buffer.from; that is a failed verification.
    return false;
  }
}

type SandboxPayload = {
  session_id?: unknown;
  outcome?: unknown;
  failure_reason?: unknown;
};

export const sandboxProvider: PaymentProvider = {
  name: "sandbox",
  isSandbox: true,

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    // Deterministic from the payment id: retrying a checkout for the same
    // payment must not create a second session the webhook could match.
    const sessionId = `sbx_${req.paymentId}`;
    const url = new URL(req.returnUrl);
    url.searchParams.set("session", sessionId);
    return { sessionId, redirectUrl: url.toString() };
  },

  verifyWebhook(rawBody: string, headers: Headers): VerifiedEvent {
    const signature = headers.get(SIGNATURE_HEADER) ?? "";
    if (!signature) throw new WebhookVerificationError("missing_signature");

    // Signature is checked against the RAW body, before parsing. Verifying a
    // re-serialised object would let a payload that parses differently than it
    // signs through.
    if (!signaturesMatch(signature, signPayload(rawBody))) {
      throw new WebhookVerificationError("bad_signature");
    }

    const eventId = headers.get(EVENT_HEADER) ?? "";
    if (!eventId) throw new WebhookVerificationError("missing_event_id");

    let payload: SandboxPayload;
    try {
      payload = JSON.parse(rawBody) as SandboxPayload;
    } catch {
      throw new WebhookVerificationError("malformed_body");
    }

    if (typeof payload.session_id !== "string" || !payload.session_id) {
      throw new WebhookVerificationError("missing_session_id");
    }
    if (payload.outcome !== "succeeded" && payload.outcome !== "failed") {
      throw new WebhookVerificationError("bad_outcome");
    }

    return {
      eventId,
      sessionId: payload.session_id,
      outcome: payload.outcome,
      failureReason:
        typeof payload.failure_reason === "string"
          ? payload.failure_reason
          : undefined,
    };
  },
};

/** Header names the emitter must set. Exported so the two cannot drift. */
export const SANDBOX_HEADERS = {
  signature: SIGNATURE_HEADER,
  eventId: EVENT_HEADER,
} as const;
