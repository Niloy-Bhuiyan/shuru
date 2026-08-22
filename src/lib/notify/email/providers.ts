/**
 * CONCRETE EMAIL PROVIDERS
 *
 * Each is a thin fetch wrapper over the provider's REST API. Both Resend and
 * Postmark accept a single JSON POST, so neither needs an SDK.
 *
 * Every request is bounded by an AbortController: a hung provider connection
 * must not hold a dispatch run open until the platform kills it, which would
 * also lose the stamps for messages already sent in that run.
 */

import { retryableForStatus, type EmailMessage, type EmailProvider, type SendResult } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ status: number; text: string } | { status: null; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    // status null = transport failure, always retryable
    return { status: null, text: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract a provider message id without assuming a response shape. */
function idFrom(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const id = parsed.id ?? parsed.MessageID;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** https://resend.com/docs/api-reference/emails/send-email */
export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(m: EmailMessage): Promise<SendResult> {
      const res = await postJson(
        "https://api.resend.com/emails",
        { authorization: `Bearer ${apiKey}` },
        { from, to: [m.to], subject: m.subject, text: m.text, html: m.html }
      );
      if (res.status === null) {
        return { ok: false, error: `transport: ${res.text}`, retryable: true };
      }
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, id: idFrom(res.text) };
      }
      return {
        ok: false,
        error: `resend ${res.status}: ${res.text.slice(0, 200)}`,
        retryable: retryableForStatus(res.status),
      };
    },
  };
}

/** https://postmarkapp.com/developer/api/email-api */
export function postmarkProvider(token: string, from: string): EmailProvider {
  return {
    name: "postmark",
    async send(m: EmailMessage): Promise<SendResult> {
      const res = await postJson(
        "https://api.postmarkapp.com/email",
        { "x-postmark-server-token": token, accept: "application/json" },
        {
          From: from,
          To: m.to,
          Subject: m.subject,
          TextBody: m.text,
          HtmlBody: m.html,
          MessageStream: "outbound",
        }
      );
      if (res.status === null) {
        return { ok: false, error: `transport: ${res.text}`, retryable: true };
      }
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, id: idFrom(res.text) };
      }
      return {
        ok: false,
        error: `postmark ${res.status}: ${res.text.slice(0, 200)}`,
        retryable: retryableForStatus(res.status),
      };
    },
  };
}

/**
 * Development provider: logs instead of sending.
 *
 * It reports `ok`, which means the caller WILL stamp `emailed_at`. That is
 * correct for local work — the message was handled by the configured
 * provider — but it is the reason `selectEmailProvider` never picks this in
 * production without an explicit opt-in. Silently "delivering" to a log in
 * production would make `emailed_at` a lie, and this schema exists precisely
 * so per-channel delivery is never overstated.
 */
export function consoleProvider(): EmailProvider {
  return {
    name: "console",
    async send(m: EmailMessage): Promise<SendResult> {
      console.info(`[email:console] to=${m.to} subject=${m.subject}`);
      return { ok: true, id: null };
    },
  };
}
