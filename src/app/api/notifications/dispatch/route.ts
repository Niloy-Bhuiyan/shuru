/**
 * /api/notifications/dispatch — send pending notification emails.
 *
 * POST performs a run; GET reports configuration without sending. Protected
 * by INGEST_SECRET, the same shared secret the ingestion cron uses — this is
 * a scheduled job endpoint, not a user-facing route.
 *
 * The rule this endpoint exists to keep: `emailed_at` is stamped ONLY after
 * the provider accepted the message. A failure leaves it null so the next run
 * retries, and a permanent failure is reported rather than silently marked
 * sent. Nothing may claim a delivery that did not happen.
 */

import { NextRequest, NextResponse } from "next/server";
import { selectEmailProvider } from "@/lib/notify/email";
import { planEmailDispatch, renderNotificationEmail, type Recipient } from "@/lib/notify/dispatch";
import { selectPushConfig, sendPush } from "@/lib/notify/push";
import { supabaseServiceRole } from "@/lib/supabase/server";
import type {
  Notification,
  NotificationPreferences,
  PushSubscriptionRow,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Bound on one run, so a backlog cannot exceed the platform's time limit. */
const BATCH_LIMIT = 100;

function secretOk(req: NextRequest): boolean {
  const required = process.env.INGEST_SECRET;
  if (!required) return true;
  const provided =
    req.headers.get("x-ingest-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return provided === required;
}

export async function GET() {
  const email = selectEmailProvider();
  const push = selectPushConfig();
  return NextResponse.json({
    email: {
      configured: email.provider !== null,
      provider: email.provider?.name ?? null,
      reason: email.provider === null ? email.reason : null,
    },
    push: {
      configured: push.config !== null,
      reason: push.config === null ? push.reason : null,
    },
    secret_required: Boolean(process.env.INGEST_SECRET),
  });
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const selection = selectEmailProvider();
  const pushSelection = selectPushConfig();

  if (selection.provider === null && pushSelection.config === null) {
    // Not an error: both are optional channels. Say so plainly so a
    // scheduler's logs show why nothing was sent.
    return NextResponse.json(
      {
        skipped: true,
        email_reason: selection.reason,
        push_reason: pushSelection.reason,
        sent: 0,
      },
      { status: 200 }
    );
  }

  let db: SupabaseClient;
  try {
    db = supabaseServiceRole();
  } catch (e) {
    return NextResponse.json(
      { error: "service_role_key_missing", detail: (e as Error).message },
      { status: 500 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const email =
    selection.provider === null
      ? { skipped: selection.reason }
      : await dispatchEmail(db, selection.provider, siteUrl);

  const push =
    pushSelection.config === null
      ? { skipped: pushSelection.reason }
      : await dispatchPush(db, pushSelection.config, siteUrl);

  return NextResponse.json({ email, push });
}

type ChannelReport =
  | { skipped: string }
  | {
      provider?: string;
      sent: number;
      failed: number;
      skipped: number;
      skip_reasons?: Record<string, number>;
      failures?: { id: string; error: string; retryable: boolean }[];
    };

/** Email pass: rows with no `emailed_at`, honouring preferences and caps. */
async function dispatchEmail(
  db: SupabaseClient,
  provider: NonNullable<ReturnType<typeof selectEmailProvider>["provider"]>,
  siteUrl: string
): Promise<ChannelReport> {
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .is("emailed_at", null)
    .order("priority", { ascending: false })
    .limit(BATCH_LIMIT);
  if (error) return { skipped: `db_read_failed: ${error.message}` };

  const pending = (data ?? []) as Notification[];
  if (pending.length === 0) {
    return { provider: provider.name, sent: 0, failed: 0, skipped: 0 };
  }

  const userIds = Array.from(new Set(pending.map((n) => n.user_id)));
  const recipients = await loadRecipients(db, userIds);
  const plan = planEmailDispatch(pending, recipients);

  let sent = 0;
  const failures: { id: string; error: string; retryable: boolean }[] = [];

  for (const item of plan.send) {
    const message = renderNotificationEmail(item.notification, siteUrl);
    const result = await provider.send({ to: item.email, ...message });

    if (!result.ok) {
      failures.push({
        id: item.notification.id,
        error: result.error,
        retryable: result.retryable,
      });
      // emailed_at stays null: a retryable failure is picked up next run, and
      // a permanent one is reported rather than marked delivered.
      continue;
    }

    const { error: stampError } = await db
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", item.notification.id);

    if (stampError) {
      // Sent but not stamped. Report it — this is the one case that can cause
      // a duplicate on the next run, and hiding it would make that a mystery.
      failures.push({
        id: item.notification.id,
        error: `sent but not stamped: ${stampError.message}`,
        retryable: false,
      });
      continue;
    }
    sent += 1;
  }

  return {
    provider: provider.name,
    sent,
    failed: failures.length,
    skipped: plan.skip.length,
    skip_reasons: countBy(plan.skip.map((s) => s.reason)),
    failures: failures.slice(0, 10),
  };
}

/**
 * Push pass: rows with no `pushed_at`, fanned out to each of the user's live
 * devices.
 *
 * `pushed_at` is stamped when at least ONE device accepted. A user with a
 * stale second device should not have the alert retried forever, and a user
 * with no live device at all is left unstamped so it sends if they subscribe.
 */
async function dispatchPush(
  db: SupabaseClient,
  config: NonNullable<ReturnType<typeof selectPushConfig>["config"]>,
  siteUrl: string
): Promise<ChannelReport> {
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .is("pushed_at", null)
    .order("priority", { ascending: false })
    .limit(BATCH_LIMIT);
  if (error) return { skipped: `db_read_failed: ${error.message}` };

  const pending = (data ?? []) as Notification[];
  if (pending.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const userIds = Array.from(new Set(pending.map((n) => n.user_id)));

  const { data: prefRows } = await db
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);
  const prefsById = new Map(
    ((prefRows ?? []) as NotificationPreferences[]).map((p) => [p.user_id, p])
  );

  const { data: subRows } = await db
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds)
    .is("expired_at", null);
  const subsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const s of (subRows ?? []) as PushSubscriptionRow[]) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  let sent = 0;
  let skipped = 0;
  const failures: { id: string; error: string; retryable: boolean }[] = [];
  const now = Date.now();

  for (const n of pending) {
    // browser_push defaults to false — push is opt-in, like email.
    if (!prefsById.get(n.user_id)?.browser_push) {
      skipped += 1;
      continue;
    }
    if (n.expires_at && new Date(n.expires_at).getTime() <= now) {
      skipped += 1;
      continue;
    }
    const subs = subsByUser.get(n.user_id) ?? [];
    if (subs.length === 0) {
      skipped += 1;
      continue;
    }

    const opportunityId = n.data?.opportunity_id;
    const payload = {
      title: n.title,
      body: n.body ?? "",
      url:
        typeof opportunityId === "string"
          ? `${siteUrl.replace(/\/+$/, "")}/opportunity/${opportunityId}`
          : `${siteUrl.replace(/\/+$/, "")}/notifications`,
      tag: n.type,
    };

    let anyAccepted = false;
    for (const sub of subs) {
      const result = await sendPush(config, sub, payload);

      if (result.ok) {
        anyAccepted = true;
        await db
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
        continue;
      }

      if (result.gone) {
        // Retire the dead endpoint so it stops consuming attempts.
        await db
          .from("push_subscriptions")
          .update({ expired_at: new Date().toISOString() })
          .eq("id", sub.id);
        continue;
      }
      failures.push({ id: n.id, error: result.error, retryable: result.retryable });
    }

    if (anyAccepted) {
      await db
        .from("notifications")
        .update({ pushed_at: new Date().toISOString() })
        .eq("id", n.id);
      sent += 1;
    }
  }

  return { sent, failed: failures.length, skipped, failures: failures.slice(0, 10) };
}

/**
 * Addresses, preferences and today's send count for a set of users.
 *
 * Addresses come from the auth admin API because `auth.users` is not exposed
 * through PostgREST; preferences and counts are ordinary service-role reads.
 */
async function loadRecipients(
  db: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Recipient>> {
  const { data: prefRows } = await db
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);
  const prefsById = new Map(
    ((prefRows ?? []) as NotificationPreferences[]).map((p) => [p.user_id, p])
  );

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data: todayRows } = await db
    .from("notifications")
    .select("user_id")
    .in("user_id", userIds)
    .gte("emailed_at", startOfDay.toISOString());
  const sentToday = new Map<string, number>();
  for (const row of (todayRows ?? []) as { user_id: string }[]) {
    sentToday.set(row.user_id, (sentToday.get(row.user_id) ?? 0) + 1);
  }

  const out = new Map<string, Recipient>();
  for (const userId of userIds) {
    let email: string | null = null;
    try {
      const { data } = await db.auth.admin.getUserById(userId);
      email = data.user?.email ?? null;
    } catch {
      // A lookup failure must not abort the run — this user is skipped as
      // "no_email_address" and retried next time.
      email = null;
    }
    out.set(userId, {
      userId,
      email,
      prefs: prefsById.get(userId) ?? null,
      emailedToday: sentToday.get(userId) ?? 0,
    });
  }
  return out;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
