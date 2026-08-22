/**
 * WEB PUSH DELIVERY
 *
 * Mirrors the email adapter's posture: configuration is explicit, absence is
 * not an error, and nothing stamps `pushed_at` unless the push service
 * actually accepted the message.
 *
 * Encryption (RFC 8291) and VAPID JWT signing are delegated to `web-push`.
 * That crypto is subtle enough that a hand-rolled version would fail silently
 * — a wrong key derivation produces a well-formed request the push service
 * accepts and the browser then cannot decrypt.
 */

import webpush from "web-push";
import type { PushSubscriptionRow } from "@/lib/types";

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

export type PushSelection =
  | { config: PushConfig }
  | { config: null; reason: string };

export type PushResult =
  | { ok: true }
  /** The subscription is gone — mark it expired, do not retry. */
  | { ok: false; gone: true; error: string }
  | { ok: false; gone: false; error: string; retryable: boolean };

function real(value: string | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v.length === 0) return false;
  return !/^(your|changeme|placeholder|xxx|<.*>)/i.test(v);
}

/**
 * Reads the VAPID keypair from the environment.
 *
 * Never throws: push is optional. A deployment without keys simply does not
 * push, and `pushed_at` stays null.
 */
export function selectPushConfig(
  env: Record<string, string | undefined> = process.env
): PushSelection {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;

  if (!real(publicKey)) {
    return { config: null, reason: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set" };
  }
  if (!real(privateKey)) {
    return { config: null, reason: "VAPID_PRIVATE_KEY is not set" };
  }
  // The push services reject a VAPID JWT whose `sub` is not mailto: or https:,
  // so an obviously wrong value is caught here rather than as a 403 per send.
  if (!real(subject) || !/^(mailto:|https:)/.test(subject)) {
    return {
      config: null,
      reason: "VAPID_SUBJECT must be a mailto: or https: URL",
    };
  }
  return { config: { publicKey, privateKey, subject } };
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where the service worker navigates when the notification is clicked. */
  url: string;
  /** Collapses replacing alerts about the same subject. */
  tag?: string;
};

/**
 * Sends one notification to one device.
 *
 * A 404 or 410 from the push service means the subscription is permanently
 * gone (browser uninstalled, permission revoked, endpoint rotated). That is
 * reported as `gone` so the caller retires the row instead of retrying it
 * forever — a dead endpoint otherwise consumes a send attempt on every run.
 */
export async function sendPush(
  config: PushConfig,
  subscription: Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth">,
  payload: PushPayload
): Promise<PushResult> {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    );
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    const status = err.statusCode;

    if (status === 404 || status === 410) {
      return { ok: false, gone: true, error: `subscription gone (${status})` };
    }
    return {
      ok: false,
      gone: false,
      error: `${status ?? "transport"}: ${err.message ?? String(e)}`,
      // 429 and 5xx are worth another run; a 400/403 is a configuration fault
      retryable: status === undefined || status === 429 || status >= 500,
    };
  }
}
