"use client";

import React from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { PixelSun } from "./PixelSun";
import { useLang } from "@/lib/i18n";

/**
 * SunriseHeader — top app bar. Static mini sun mark + wordmark on the left,
 * EN/বাং language toggle on the right. Sticky within the app frame.
 */
export function SunriseHeader() {
  const { lang, setLang } = useLang();

  return (
    <header className="sticky top-0 z-40 border-b-3 border-ink bg-cream">
      <div className="flex items-center justify-between px-4 py-2.5">
        <Link href="/radar" className="flex items-center gap-2">
          <PixelSun width={26} withHorizon={false} />
          <span className="font-pixel text-sm leading-none text-ink">SHURU</span>
          <span className="font-bangla text-sm font-bold leading-none text-amber">
            শুরু
          </span>
        </Link>

        <div
          className="flex border-2 border-ink shadow-pixel-sm"
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
                "px-2 py-1 text-[11px] font-bold uppercase",
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
    </header>
  );
}

export default SunriseHeader;
