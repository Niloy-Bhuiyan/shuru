"use client";

import React from "react";
import { PixelSun } from "./PixelSun";

/**
 * SunriseHero — the home-screen greeting panel with the slow, low-frame-rate
 * pixel sunrise behind it. Pure CSS steps() animation: one transform + one
 * opacity, cheap on mid-range Android. No canvas, no WebGL.
 */
export function SunriseHero({
  greeting,
  line2,
}: {
  greeting: string;
  line2?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b-3 border-ink bg-cream">
      {/* dithered dawn sky bands (our only "gradient") — a slow 2-frame
          shimmer keeps the header alive after the sun finishes rising */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-4 dither-amber sky-shimmer"
        style={{ "--sky-hi": "0.5", "--sky-lo": "0.32" } as React.CSSProperties}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-4 h-4 dither-amber sky-shimmer"
        style={
          {
            "--sky-hi": "0.3",
            "--sky-lo": "0.18",
            animationDelay: "1.6s",
          } as React.CSSProperties
        }
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-8 h-4 dither-amber sky-shimmer"
        style={
          {
            "--sky-hi": "0.15",
            "--sky-lo": "0.08",
            animationDelay: "0.8s",
          } as React.CSSProperties
        }
      />

      <div className="absolute bottom-0 right-3" aria-hidden>
        <PixelSun width={96} animated />
      </div>

      <div className="relative px-4 pb-5 pt-9 pr-32">
        <p className="font-pixel text-[13px] leading-relaxed text-ink">{greeting}</p>
        {line2 && (
          <p className="mt-2 font-mono text-xs font-bold text-ink/80">{line2}</p>
        )}
      </div>
    </section>
  );
}

export default SunriseHero;
