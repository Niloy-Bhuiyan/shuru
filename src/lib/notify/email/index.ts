/**
 * PROVIDER SELECTION
 *
 * Chosen from the environment so switching providers is a config change, not
 * a code change. Selection is explicit (`EMAIL_PROVIDER`) rather than inferred
 * from whichever key happens to be present — inference makes it possible to
 * think you are sending through one provider while a stale key routes to
 * another.
 */

import { consoleProvider, postmarkProvider, resendProvider } from "./providers";
import type { EmailProvider } from "./types";

export type EmailSelection =
  | { provider: EmailProvider; from: string }
  | { provider: null; reason: string };

/** A value that is present and not an unfilled template placeholder. */
function real(value: string | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length === 0) return false;
  return !/^(your|changeme|placeholder|xxx|<.*>)/i.test(v);
}

/**
 * Returns the configured provider, or a reason it is unavailable.
 *
 * Never throws: email is an optional channel. An unconfigured deployment must
 * keep running and simply not send, leaving `emailed_at` null so nothing
 * claims a delivery that did not happen.
 */
export function selectEmailProvider(
  env: Record<string, string | undefined> = process.env
): EmailSelection {
  const choice = (env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const from = env.EMAIL_FROM;

  if (!choice) {
    return { provider: null, reason: "EMAIL_PROVIDER is not set" };
  }

  if (choice === "console") {
    // Explicit opt-in only. Guarded because a console "send" stamps
    // emailed_at, and doing that in production would falsify the record.
    if (env.NODE_ENV === "production" && env.EMAIL_ALLOW_CONSOLE !== "true") {
      return {
        provider: null,
        reason:
          "EMAIL_PROVIDER=console is refused in production (set EMAIL_ALLOW_CONSOLE=true only for a deliberate dry run)",
      };
    }
    return { provider: consoleProvider(), from: from ?? "dev@localhost" };
  }

  if (!real(from)) {
    return { provider: null, reason: "EMAIL_FROM is not set" };
  }

  if (choice === "resend") {
    if (!real(env.RESEND_API_KEY)) {
      return { provider: null, reason: "RESEND_API_KEY is not set" };
    }
    return { provider: resendProvider(env.RESEND_API_KEY, from), from };
  }

  if (choice === "postmark") {
    if (!real(env.POSTMARK_SERVER_TOKEN)) {
      return { provider: null, reason: "POSTMARK_SERVER_TOKEN is not set" };
    }
    return { provider: postmarkProvider(env.POSTMARK_SERVER_TOKEN, from), from };
  }

  return {
    provider: null,
    reason: `unknown EMAIL_PROVIDER "${choice}" (expected: resend, postmark, console)`,
  };
}

export type { EmailMessage, EmailProvider, SendResult } from "./types";
