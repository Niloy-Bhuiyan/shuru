"use client";

/**
 * NOTIFICATION CENTRE
 *
 * Alerts are rows written by database triggers, not pushes (0005), so this
 * screen reads them directly. Two honesty rules carry over from the schema:
 *
 *  - Delivery is reported per channel. `emailed_at`/`pushed_at` being null
 *    means that channel has not run, and the UI says so rather than implying
 *    the alert was emailed just because it exists.
 *  - The match-score floor never turns an abstention into an alert; the hint
 *    under the slider states that outright (see ADR 0002).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  deleteNotification,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
} from "@/lib/data/notifications";
import {
  isPushSubscribed,
  pushSupport,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/data/push";
import { useLang } from "@/lib/i18n";
import type { Notification, NotificationPreferences } from "@/lib/types";

/** Deep-link target for the types that carry one. */
function hrefFor(n: Notification): string | null {
  const opportunityId = n.data?.opportunity_id;
  return typeof opportunityId === "string" ? `/opportunity/${opportunityId}` : null;
}

function toneFor(n: Notification): string {
  if (n.type === "application_accepted" || n.type === "application_shortlisted")
    return "bg-mint";
  if (n.type === "application_rejected") return "bg-grey";
  if (n.priority >= 90) return "bg-alert";
  return "bg-amber";
}

export default function NotificationsPage() {
  const { t } = useLang();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  // push lives outside the preferences row: it is per-device browser state
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);

  useEffect(() => {
    const support = pushSupport();
    setPushAvailable(support.supported);
    if (!support.supported) {
      setPushNote(support.reason);
      return;
    }
    isPushSubscribed().then(setPushOn);
  }, []);

  async function onTogglePush(e: React.ChangeEvent<HTMLInputElement>) {
    const want = e.target.checked;
    setPushBusy(true);
    setPushNote(null);
    try {
      if (want) {
        const result = await subscribeToPush();
        if (!result.ok) {
          setPushNote(result.reason);
          setPushOn(false);
        } else {
          setPushOn(true);
          // Mirror it into preferences so the sender honours it too.
          patch({ browser_push: true });
        }
      } else {
        await unsubscribeFromPush();
        setPushOn(false);
        patch({ browser_push: false });
      }
    } finally {
      setPushBusy(false);
    }
  }

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [rows, p] = await Promise.all([
        listNotifications(),
        getNotificationPreferences(),
      ]);
      setItems(rows);
      setPrefs(p);
    } catch {
      // Never hang on the loader — surface an explicit retry (same pattern
      // the radar screen uses).
      setLoadError(true);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onMarkAll() {
    await markAllNotificationsRead();
    await load();
  }

  async function onRead(n: Notification) {
    if (n.read_at) return;
    await markNotificationRead(n.id);
    setItems((prev) =>
      (prev ?? []).map((x) =>
        x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
      )
    );
  }

  async function onDismiss(n: Notification) {
    await deleteNotification(n.id);
    setItems((prev) => (prev ?? []).filter((x) => x.id !== n.id));
  }

  async function onSavePrefs() {
    if (!prefs) return;
    setSaving("saving");
    await saveNotificationPreferences(prefs);
    setSaving("saved");
  }

  function patch(next: Partial<NotificationPreferences>) {
    setPrefs((p) => (p ? { ...p, ...next } : p));
    setSaving("idle");
  }

  if (items === null) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <main className="px-4 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="font-pixel text-xs text-ink">{t("notif.title")}</h1>
        {unread > 0 && (
          <button
            type="button"
            onClick={onMarkAll}
            className="border-2 border-ink bg-paper px-2 py-1 font-mono text-[11px] font-bold uppercase text-ink active:translate-x-[1px] active:translate-y-[1px]"
          >
            {t("notif.markAll")}
          </button>
        )}
      </div>

      {unread > 0 && (
        <p className="mt-2 font-mono text-[11px] text-ink/70">
          {unread} {t("notif.unread")}
        </p>
      )}

      {loadError && (
        <div className="mt-3 border-3 border-ink bg-alert p-2">
          <p className="font-mono text-xs font-bold text-cream">
            {t("notif.loadError")}
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-2 border-2 border-ink bg-cream px-2 py-1 font-mono text-[11px] font-bold uppercase text-ink"
          >
            {t("notif.retry")}
          </button>
        </div>
      )}

      {items.length === 0 && !loadError ? (
        <div className="mt-4">
          <EmptyState icon="clock" title={t("notif.empty")}>
            <p className="font-mono text-[11px] text-grey">{t("notif.emptyHint")}</p>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((n) => {
            const href = hrefFor(n);
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs font-bold text-ink">{n.title}</p>
                  {!n.read_at && (
                    <span
                      aria-label={t("notif.unread")}
                      className="mt-1 h-2 w-2 shrink-0 bg-alert"
                    />
                  )}
                </div>
                {n.body && (
                  <p className="mt-0.5 font-mono text-[11px] text-ink/70">{n.body}</p>
                )}
              </>
            );

            return (
              <li
                key={n.id}
                className="border-3 border-ink bg-cream shadow-pixel-sm"
              >
                <div className={`h-1.5 ${toneFor(n)} border-b-3 border-ink`} />
                <div className="p-2.5">
                  {href ? (
                    <Link href={href} onClick={() => onRead(n)} className="block">
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRead(n)}
                      className="block w-full text-left"
                    >
                      {body}
                    </button>
                  )}

                  <div className="mt-2 flex items-center justify-between border-t-2 border-ink/20 pt-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-grey">
                      {/* Delivery is per channel; null means it did NOT run. */}
                      {n.emailed_at ? t("notif.email") : t("notif.channelPending")}
                    </span>
                    <button
                      type="button"
                      aria-label={t("notif.dismiss")}
                      onClick={() => onDismiss(n)}
                      className="px-1 text-grey"
                    >
                      <PixelIcon name="x" size={11} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── preferences ── */}
      <section className="mb-6 mt-6 border-3 border-ink bg-paper p-3 shadow-pixel">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
          {t("notif.settings")}
        </h2>

        <div className="mt-3 space-y-2">
          {(
            [
              ["in_app", "notif.inApp"],
              ["email", "notif.email"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs?.[key] ?? DEFAULT_NOTIFICATION_PREFERENCES[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
                className="h-4 w-4 accent-amber"
              />
              <span className="font-mono text-xs text-ink">{t(label)}</span>
            </label>
          ))}

          {/*
            Push is not a plain preference: it needs a per-device browser
            permission and subscription, so the toggle acts immediately
            rather than waiting for Save, and reports why it cannot.
          */}
          <div className="flex items-start gap-2">
            <input
              id="push-toggle"
              type="checkbox"
              checked={pushOn}
              disabled={!pushAvailable || pushBusy}
              onChange={onTogglePush}
              className="mt-0.5 h-4 w-4 accent-amber"
            />
            <label htmlFor="push-toggle" className="min-w-0">
              <span className="font-mono text-xs text-ink">{t("notif.push")}</span>
              {pushNote && (
                <span className="block font-mono text-[10px] leading-relaxed text-grey">
                  {pushNote}
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="min-score"
            className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink"
          >
            {t("notif.minScore")}:{" "}
            {prefs?.min_match_score ?? DEFAULT_NOTIFICATION_PREFERENCES.min_match_score}
          </label>
          <input
            id="min-score"
            type="range"
            min={0}
            max={100}
            step={5}
            value={
              prefs?.min_match_score ??
              DEFAULT_NOTIFICATION_PREFERENCES.min_match_score
            }
            onChange={(e) => patch({ min_match_score: Number(e.target.value) })}
            className="mt-1 w-full accent-amber"
          />
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey">
            {t("notif.minScoreHint")}
          </p>
        </div>

        <div className="mt-4">
          <label
            htmlFor="max-per-day"
            className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink"
          >
            {t("notif.maxPerDay")}
          </label>
          <input
            id="max-per-day"
            type="number"
            min={0}
            max={50}
            value={
              prefs?.max_alerts_per_day ??
              DEFAULT_NOTIFICATION_PREFERENCES.max_alerts_per_day
            }
            onChange={(e) => patch({ max_alerts_per_day: Number(e.target.value) })}
            className="mt-1 w-full border-3 border-ink bg-cream px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:shadow-pixel-sm"
          />
        </div>

        <button
          type="button"
          onClick={onSavePrefs}
          disabled={!prefs || saving === "saving"}
          className="mt-4 w-full border-3 border-ink bg-amber px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
        >
          {saving === "saving"
            ? t("notif.saving")
            : saving === "saved"
              ? t("notif.savedOk")
              : t("notif.save")}
        </button>
      </section>
    </main>
  );
}
