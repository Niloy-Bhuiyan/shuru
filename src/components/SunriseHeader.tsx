"use client";

import React from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { PixelSun } from "./PixelSun";
import { NotificationBell } from "./NotificationBell";
import { PixelIcon } from "./pixel/PixelIcon";
import { usePro } from "@/hooks/usePro";
import { useLang } from "@/lib/i18n";

/**
 * SunriseHeader — top app bar for the STUDENT app. Static mini sun mark +
 * wordmark on the left, EN/বাং language toggle on the right.
 *
 * There is deliberately no operator entry point here. An "ADMIN" button in
 * the student header meant a student-facing screen advertised a tool that is
 * not part of the student product — the same bleed that moving admin into its
 * own route group was meant to end, just relocated instead of removed.
 *
 * Operators reach their console by signing in: postSignIn lands admin on
 * /admin and employer on /employer. The student app never mentions it.
 */
/**
 * `upgrade` is opt-in, and it has to be.
 *
 * This header is also rendered by /login, /register and the other signed-out
 * auth screens. The Upgrade pill reads the caller's subscription, so mounting
 * it unconditionally made the SIGNED-OUT header fire an authenticated query —
 * caught by "signed-out header makes no authenticated data request" in
 * e2e/auth.spec.ts, which exists for exactly this. The pill lives in its own
 * component so the hook is never called on those pages rather than called and
 * ignored: a hook cannot be conditional, but a component can.
 */
export function SunriseHeader({ upgrade = false }: { upgrade?: boolean }) {
  const { lang, setLang } = useLang();

  return (
    <header className="sticky top-0 z-40 border-b border-ui-line bg-paper/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* min-w-0 + shrink so the wordmark yields first. The right-hand
            group now carries an Upgrade pill as well as the bell and the
            language toggle, which at 375px in Bangla is close to the full
            width; the brand is the one thing here that can afford to be
            clipped rather than pushing the row into a horizontal scroll. */}
        <Link href="/radar" className="flex min-w-0 shrink items-center gap-2 overflow-hidden">
          <PixelSun width={26} withHorizon={false} />
          <span className="font-sans text-[17px] font-semibold leading-none tracking-[-0.01em] text-ink">Shuru</span>
          <span className="font-bangla text-sm font-bold leading-none text-amberInk">
            শুরু
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {upgrade && <UpgradePill />}
          <NotificationBell />
          <div
            className="flex overflow-hidden rounded-lg border border-ui-lineStrong"
            role="group"
            aria-label="Language"
          >
          {(["en", "bn"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={cx(
                "min-h-[32px] px-2.5 text-[13px] font-medium transition-colors",
                l === "bn" ? "font-bangla" : "font-sans",
                lang === l
                  ? "bg-ink text-white"
                  : "bg-paper text-ui-muted hover:bg-cream hover:text-ink"
              )}
            >
                {l === "en" ? "EN" : "বাং"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * MOBILE'S ONLY PERSISTENT DOOR TO /pro.
 *
 * The desktop rail carries an Upgrade entry at its foot, but the rail is
 * `hidden lg:flex` and the mobile bottom bar is full at five destinations — so
 * on a phone the pricing screen was reachable only from the plan card on /you
 * or by colliding with a locked feature. Discoverable exclusively by being
 * refused something is not discoverable.
 *
 * Hidden from `lg`, where the rail already has it, so the two never show at
 * once. Hidden once you are Pro, because a permanent upgrade button for
 * somebody who already paid is an advertisement rather than navigation.
 */
function UpgradePill() {
  const { t } = useLang();
  const { isPro, loading } = usePro();

  if (loading || isPro) return null;

  return (
    <Link
      href="/pro"
      className="flex min-h-[32px] items-center gap-1.5 rounded-full bg-amber/12 px-2.5 font-sans text-[13px] font-medium text-amberInk transition-colors hover:bg-amber/20 lg:hidden"
    >
      <PixelIcon name="spark" size={13} />
      {t("pro.upgradeShort")}
    </Link>
  );
}

export default SunriseHeader;
