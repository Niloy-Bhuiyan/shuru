"use client";

/**
 * Unread-alert indicator in the app bar.
 *
 * Polls rather than subscribing: the count is a head-only COUNT query (no row
 * payload), and a realtime channel for a number that changes a few times a day
 * costs a persistent socket on every screen for no felt benefit.
 *
 * A failed count renders as no badge. An alert indicator that shows a stale or
 * invented number is worse than one that shows nothing.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { countUnreadNotifications } from "@/lib/data/notifications";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

const POLL_MS = 60_000;

export function NotificationBell() {
  const { t } = useLang();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  /** Null until the session check resolves, so the bell never flashes in. */
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      try {
        const n = await countUnreadNotifications();
        if (!cancelled) setUnread(n);
      } catch {
        if (!cancelled) setUnread(0);
      }
    }

    (async () => {
      // SunriseHeader also renders on the signed-out auth screens, where a
      // notifications query is guaranteed to 401. Check for a session first:
      // a signed-out user has no alerts, so the bell should not appear at all
      // rather than poll and swallow the error.
      const {
        data: { user },
      } = await supabaseBrowser().auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      await tick();
      timer = setInterval(tick, POLL_MS);
    })().catch(() => {
      if (!cancelled) setSignedIn(false);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // re-count on navigation so reading the centre clears the badge promptly
  }, [pathname]);

  if (!signedIn) return null;

  return (
    <Link
      href="/notifications"
      aria-label={`${t("notif.title")}${unread > 0 ? ` (${unread})` : ""}`}
      className="relative flex h-7 w-7 items-center justify-center border-2 border-ink bg-paper text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
    >
      <PixelIcon name="signal" size={13} />
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-[15px] border-2 border-ink bg-alert px-[2px] text-center font-mono text-[9px] font-bold leading-[11px] text-cream">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

export default NotificationBell;
