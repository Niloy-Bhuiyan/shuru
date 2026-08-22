/**
 * EMAIL DISPATCH SELECTION
 *
 * Pure decision logic: given unsent notifications plus each recipient's
 * preferences, decide what to email and why anything was skipped. No I/O, so
 * the rules are testable without a provider or a database.
 *
 * Design rules that come straight from the schema (0005):
 *
 *  - `notification_preferences.email` defaults to FALSE. Email is opt-in, so
 *    a user who has never touched their settings is never emailed. A missing
 *    preferences row is treated as the defaults, i.e. also no email.
 *  - `max_alerts_per_day` is a hard cap and is counted against alerts already
 *    emailed today, not against alerts created today. The cap limits what we
 *    put in someone's inbox.
 *  - An expired notification is dropped rather than sent late. An alert about
 *    a listing that has closed is worse than no alert.
 */

import type { Notification, NotificationPreferences } from "@/lib/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/data/notifications";

export type Recipient = {
  userId: string;
  /** Null when the auth record has no address (OAuth edge cases). */
  email: string | null;
  /** Null when the user has never saved preferences. */
  prefs: NotificationPreferences | null;
  /** How many alerts have already been emailed to this user today. */
  emailedToday: number;
};

export type SkipReason =
  | "no_email_address"
  | "email_disabled"
  | "daily_cap_reached"
  | "expired"
  | "already_emailed";

export type Plan = {
  send: { notification: Notification; email: string }[];
  skip: { notification: Notification; reason: SkipReason }[];
};

/**
 * Decides what to email.
 *
 * Notifications are taken highest-priority first so that when a daily cap
 * truncates the list, the alerts that survive are the ones that matter most —
 * an interview invitation should not be dropped in favour of a routine match.
 */
export function planEmailDispatch(
  notifications: readonly Notification[],
  recipients: ReadonlyMap<string, Recipient>,
  now: Date = new Date()
): Plan {
  const plan: Plan = { send: [], skip: [] };
  const nowMs = now.getTime();

  // Track allowance as we go so one run cannot exceed the cap by itself.
  const remaining = new Map<string, number>();

  const ordered = [...notifications].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.created_at.localeCompare(b.created_at);
  });

  for (const n of ordered) {
    if (n.emailed_at) {
      plan.skip.push({ notification: n, reason: "already_emailed" });
      continue;
    }
    if (n.expires_at && new Date(n.expires_at).getTime() <= nowMs) {
      plan.skip.push({ notification: n, reason: "expired" });
      continue;
    }

    const r = recipients.get(n.user_id);
    if (!r || !r.email) {
      plan.skip.push({ notification: n, reason: "no_email_address" });
      continue;
    }

    const prefs = r.prefs ?? {
      user_id: r.userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };
    if (!prefs.email) {
      plan.skip.push({ notification: n, reason: "email_disabled" });
      continue;
    }

    if (!remaining.has(r.userId)) {
      remaining.set(
        r.userId,
        Math.max(0, prefs.max_alerts_per_day - r.emailedToday)
      );
    }
    const left = remaining.get(r.userId)!;
    if (left <= 0) {
      plan.skip.push({ notification: n, reason: "daily_cap_reached" });
      continue;
    }

    remaining.set(r.userId, left - 1);
    plan.send.push({ notification: n, email: r.email });
  }

  return plan;
}

/**
 * Renders one notification as an email.
 *
 * Deliberately plain: the body restates the alert and links back to the app.
 * Nothing here re-derives or re-scores anything — the notification row is the
 * source of truth, and an email that disagreed with the in-app centre would
 * be worse than no email.
 */
export function renderNotificationEmail(
  n: Notification,
  siteUrl: string
): { subject: string; text: string; html: string } {
  const base = siteUrl.replace(/\/+$/, "");
  const opportunityId = n.data?.opportunity_id;
  const link =
    typeof opportunityId === "string"
      ? `${base}/opportunity/${opportunityId}`
      : `${base}/notifications`;

  const lines = [n.title, n.body ?? "", "", link, "", "— Shuru"].filter(
    (l, i, arr) => !(l === "" && arr[i - 1] === "")
  );

  return {
    subject: n.title,
    text: lines.join("\n"),
    html:
      `<p><strong>${escapeHtml(n.title)}</strong></p>` +
      (n.body ? `<p>${escapeHtml(n.body)}</p>` : "") +
      `<p><a href="${escapeHtml(link)}">Open in Shuru</a></p>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
