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
import { supabaseServiceRole } from "@/lib/supabase/server";
import type { Notification, NotificationPreferences } from "@/lib/types";
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
  const selection = selectEmailProvider();
  return NextResponse.json({
    configured: selection.provider !== null,
    provider: selection.provider?.name ?? null,
    reason: selection.provider === null ? selection.reason : null,
    secret_required: Boolean(process.env.INGEST_SECRET),
  });
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const selection = selectEmailProvider();
  if (selection.provider === null) {
    // Not an error: email is an optional channel. Say so plainly so a
    // scheduler's logs show why nothing was sent.
    return NextResponse.json(
      { skipped: true, reason: selection.reason, sent: 0 },
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

  const { data: pendingRows, error: readError } = await db
    .from("notifications")
    .select("*")
    .is("emailed_at", null)
    .order("priority", { ascending: false })
    .limit(BATCH_LIMIT);
  if (readError) {
    return NextResponse.json({ error: "db_read_failed" }, { status: 502 });
  }

  const pending = (pendingRows ?? []) as Notification[];
  if (pending.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 0, provider: selection.provider.name });
  }

  const userIds = Array.from(new Set(pending.map((n) => n.user_id)));
  const recipients = await loadRecipients(db, userIds);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const plan = planEmailDispatch(pending, recipients);

  let sent = 0;
  const failures: { id: string; error: string; retryable: boolean }[] = [];

  for (const item of plan.send) {
    const message = renderNotificationEmail(item.notification, siteUrl);
    const result = await selection.provider.send({ to: item.email, ...message });

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

    const { error } = await db
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", item.notification.id);

    if (error) {
      // Sent but not stamped. Report it — this is the one case that can cause
      // a duplicate on the next run, and hiding it would make that a mystery.
      failures.push({
        id: item.notification.id,
        error: `sent but not stamped: ${error.message}`,
        retryable: false,
      });
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({
    provider: selection.provider.name,
    sent,
    failed: failures.length,
    skipped: plan.skip.length,
    skip_reasons: countBy(plan.skip.map((s) => s.reason)),
    failures: failures.slice(0, 10),
  });
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
