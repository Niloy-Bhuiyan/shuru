"use client";

import React from "react";
import { cx } from "@/lib/cx";
import { useLang } from "@/lib/i18n";

/**
 * Pixel loading skeleton — dithered bars that "shimmer" by marching the
 * dither tile sideways in hard steps (no gradient, no blur). Keeps the
 * blinking-cursor label. Falls back to a static dither under
 * prefers-reduced-motion (handled in globals.css).
 */
export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useLang();
  return (
    <div className="border-3 border-ink bg-paper p-4 shadow-pixel">
      <p className="font-pixel text-[10px] text-ink">
        {label ?? t("common.loading")}
        <span className="pixel-blink">▮</span>
      </p>
      <div className={cx("mt-3 h-3 w-full dither-grey pixel-shimmer")} />
      <div
        className={cx("mt-2 h-3 w-4/5 dither-grey pixel-shimmer")}
        style={{ animationDelay: "120ms" }}
      />
      <div
        className={cx("mt-2 h-3 w-2/3 dither-grey pixel-shimmer")}
        style={{ animationDelay: "240ms" }}
      />
    </div>
  );
}

export default LoadingBlock;
