"use client";

import React from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { PixelSun } from "./PixelSun";
import { NotificationBell } from "./NotificationBell";
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
export function SunriseHeader() {
  const { lang, setLang } = useLang();

  return (
    <header className="sticky top-0 z-40 border-b-3 border-ink bg-cream">
      <div className="flex items-center justify-between px-4 py-2.5">
        <Link href="/radar" className="flex items-center gap-2">
          <PixelSun width={26} withHorizon={false} />
          <span className="font-sans text-[17px] font-semibold leading-none tracking-[-0.01em] text-ink">Shuru</span>
          <span className="font-bangla text-sm font-bold leading-none text-amberInk">
            শুরু
          </span>
        </Link>

        <div className="flex items-center gap-2">
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
                "px-2 py-1 text-[11px] font-bold",
                "active:translate-x-[1px] active:translate-y-[1px]",
                l === "bn" ? "font-bangla" : "font-mono",
                lang === l ? "bg-ink text-cream" : "bg-paper text-ink"
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

export default SunriseHeader;
