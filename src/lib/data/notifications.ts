"use client";

/**
 * NOTIFICATIONS DATA LAYER
 *
 * Notifications are rows (0005), not pushes. Most are written by database
 * triggers or the service role, so this module is read-plus-read-state only:
 * a client may list its own alerts, mark them read, and delete them. It may
 * never create one — `guard_notification_update` rewrites any attempt to
 * change message content, and there is no insert policy at all.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type { Notification, NotificationPreferences } from "@/lib/types";

/** Defaults mirror the column defaults in 0005 so a missing row behaves the same. */
export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  NotificationPreferences,
  "user_id"
> = {
  in_app: true,
  email: false,
  browser_push: false,
  min_match_score: 60,
  max_alerts_per_day: 5,
};

/** Hard ceiling on a single centre load; the UI paginates past this. */
const LIST_LIMIT = 50;

/**
 * Newest-first alerts for the signed-in user. Expired rows are dropped here
 * rather than in SQL so the caller never has to think about `expires_at`;
 * an alert about a listing that has closed is noise, not history.
 */
export async function listNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  let q = supabaseBrowser()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? LIST_LIMIT);

  if (options?.unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as Notification[]).filter(
    (n) => !n.expires_at || new Date(n.expires_at).getTime() > now
  );
}

/**
 * Unread count for the badge. Uses a head-only count so the payload is a
 * number, not the rows — the bell renders on every screen.
 */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await supabaseBrowser()
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw error;
}

/** Marks every currently-unread alert read. RLS scopes this to the caller. */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("notifications")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Preferences for the signed-in user, falling back to the schema defaults
 * when no row exists yet (rows are created lazily on first save).
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  return (
    (data as NotificationPreferences) ?? {
      user_id: user.id,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    }
  );
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences
): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("notification_preferences")
    .upsert(prefs, { onConflict: "user_id" });
  if (error) throw error;
}
