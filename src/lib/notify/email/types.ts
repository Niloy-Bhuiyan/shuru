/**
 * EMAIL PROVIDER CONTRACT
 *
 * Providers are addressed over their HTTP APIs rather than an SDK, so adding
 * one costs no dependency and no supply-chain surface.
 *
 * The important part of this contract is `retryable`. A 500 or a network blip
 * should be retried on the next dispatch run; a 422 for a malformed address
 * never will be, and retrying it forever would wedge the queue behind one bad
 * row. Callers use the flag to decide whether to leave `emailed_at` null (try
 * again) or record a permanent failure.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text is required — some clients never render the HTML part. */
  text: string;
  html?: string;
};

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; retryable: boolean };

export type EmailProvider = {
  /** Shown in dispatch logs and the status endpoint. */
  name: string;
  send(message: EmailMessage): Promise<SendResult>;
};

/** A 5xx or a transport error is worth another attempt; a 4xx is not. */
export function retryableForStatus(status: number): boolean {
  // 429 is the exception among 4xx: it explicitly means "try later".
  return status >= 500 || status === 429;
}
