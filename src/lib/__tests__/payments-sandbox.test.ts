/**
 * Sandbox provider: signature verification and payload validation.
 *
 * These cover the security boundary of the payment path. `verifyWebhook`
 * returning a value IS the assertion that a payload is authentic — nothing
 * downstream re-checks — so every way it must refuse is pinned here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SANDBOX_HEADERS,
  sandboxProvider,
  signPayload,
  signingSecretIsDefault,
} from "@/lib/payments/sandbox";
import { WebhookVerificationError } from "@/lib/payments/types";

function headers(sig: string, eventId = "evt_1"): Headers {
  const h = new Headers();
  if (sig) h.set(SANDBOX_HEADERS.signature, sig);
  if (eventId) h.set(SANDBOX_HEADERS.eventId, eventId);
  return h;
}

const BODY = JSON.stringify({ session_id: "sbx_abc", outcome: "succeeded" });

describe("createCheckout", () => {
  it("derives the session id from the payment id", async () => {
    // Deterministic on purpose: retrying a checkout for the same payment must
    // not create a second session the webhook could match.
    const a = await sandboxProvider.createCheckout({
      paymentId: "pay-1",
      companyId: "c",
      opportunityId: "o",
      purpose: "feature_listing",
      money: { amountMinor: 1, currency: "BDT" },
      returnUrl: "https://example.com/return",
    });
    expect(a.sessionId).toBe("sbx_pay-1");
    expect(a.redirectUrl).toContain("session=sbx_pay-1");
  });

  it("is declared a sandbox provider", () => {
    // The UI and the `is_sandbox` column both read this. If it ever reported
    // false, the app would claim money moved.
    expect(sandboxProvider.isSandbox).toBe(true);
  });
});

describe("verifyWebhook", () => {
  it("accepts a correctly signed event", () => {
    const event = sandboxProvider.verifyWebhook(BODY, headers(signPayload(BODY)));
    expect(event.sessionId).toBe("sbx_abc");
    expect(event.outcome).toBe("succeeded");
    expect(event.eventId).toBe("evt_1");
  });

  it("rejects a missing signature", () => {
    expect(() => sandboxProvider.verifyWebhook(BODY, headers(""))).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects a wrong signature", () => {
    expect(() =>
      sandboxProvider.verifyWebhook(BODY, headers("a".repeat(64)))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a non-hex signature without crashing", () => {
    // Buffer.from(x, "hex") throws on bad input; that must read as a failed
    // verification, not a 500.
    expect(() =>
      sandboxProvider.verifyWebhook(BODY, headers("not-hex-at-all"))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a body altered after signing", () => {
    // The core tamper case: a valid signature for different bytes.
    const signature = signPayload(BODY);
    const tampered = JSON.stringify({
      session_id: "sbx_someone_elses",
      outcome: "succeeded",
    });
    expect(() =>
      sandboxProvider.verifyWebhook(tampered, headers(signature))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a signature for a longer body with the same prefix", () => {
    const extended = BODY + " ";
    expect(() =>
      sandboxProvider.verifyWebhook(extended, headers(signPayload(BODY)))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a missing event id", () => {
    // Without it there is no idempotency key, and a replay would fulfil twice.
    expect(() =>
      sandboxProvider.verifyWebhook(BODY, headers(signPayload(BODY), ""))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a malformed body", () => {
    const bad = "{not json";
    expect(() =>
      sandboxProvider.verifyWebhook(bad, headers(signPayload(bad)))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a missing session id", () => {
    const body = JSON.stringify({ outcome: "succeeded" });
    expect(() =>
      sandboxProvider.verifyWebhook(body, headers(signPayload(body)))
    ).toThrow(WebhookVerificationError);
  });

  it("rejects an unrecognised outcome", () => {
    // Anything other than succeeded/failed must not be treated as success.
    const body = JSON.stringify({ session_id: "s", outcome: "maybe" });
    expect(() =>
      sandboxProvider.verifyWebhook(body, headers(signPayload(body)))
    ).toThrow(WebhookVerificationError);
  });

  it("carries a failure reason through", () => {
    const body = JSON.stringify({
      session_id: "sbx_abc",
      outcome: "failed",
      failure_reason: "sandbox_declined",
    });
    const event = sandboxProvider.verifyWebhook(body, headers(signPayload(body)));
    expect(event.outcome).toBe("failed");
    expect(event.failureReason).toBe("sandbox_declined");
  });
});

describe("signing secret", () => {
  const original = process.env.SANDBOX_PAYMENT_SIGNING_SECRET;

  beforeEach(() => {
    delete process.env.SANDBOX_PAYMENT_SIGNING_SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SANDBOX_PAYMENT_SIGNING_SECRET;
    else process.env.SANDBOX_PAYMENT_SIGNING_SECRET = original;
  });

  it("reports when it is falling back to the published development key", () => {
    // A signature checked against a public constant is not a security
    // property. The operator must be told rather than reassured by the word
    // "verified".
    expect(signingSecretIsDefault()).toBe(true);
  });

  it("reports a configured secret", () => {
    process.env.SANDBOX_PAYMENT_SIGNING_SECRET = "a-real-secret";
    expect(signingSecretIsDefault()).toBe(false);
  });

  it("changes the signature when the secret changes", () => {
    const withDefault = signPayload(BODY);
    process.env.SANDBOX_PAYMENT_SIGNING_SECRET = "a-real-secret";
    expect(signPayload(BODY)).not.toBe(withDefault);
  });

  it("refuses an event signed with the wrong secret", () => {
    process.env.SANDBOX_PAYMENT_SIGNING_SECRET = "secret-a";
    const signature = signPayload(BODY);
    process.env.SANDBOX_PAYMENT_SIGNING_SECRET = "secret-b";
    expect(() => sandboxProvider.verifyWebhook(BODY, headers(signature))).toThrow(
      WebhookVerificationError
    );
  });
});
