import React from "react";
import { cx } from "@/lib/cx";

/**
 * PixelGauge — the signature instrument. A chunky segmented pixel METER
 * (never a soft ring): 20 blocks, hard fills, big pixel-font number.
 *
 * percent=null renders the "--%" empty instrument (abstention screen
 * composes its own terminal around this).
 */
export function PixelGauge({
  percent,
  tone = "amber",
  label,
  sublabel,
  spectrum = false,
  bucket,
  animate = false,
  className,
}: {
  percent: number | null;
  tone?: "amber" | "mint" | "grey" | "alert";
  label?: string;
  sublabel?: string;
  /** readiness mode: blocks color red → amber → teal as the meter fills */
  spectrum?: boolean;
  /** big text bucket under the meter, e.g. NEEDS WORK / OKAYISH / STRONG */
  bucket?: { label: string; tone: "alert" | "amber" | "mint" };
  /** fill the meter segment-by-segment (chunky, stepped) on mount */
  animate?: boolean;
  className?: string;
}) {
  const SEGMENTS = 20;
  const filled =
    percent === null
      ? 0
      : Math.max(0, Math.min(SEGMENTS, Math.round((percent / 100) * SEGMENTS)));

  const fillClass = {
    amber: "bg-amber",
    mint: "bg-mint",
    grey: "bg-grey",
    alert: "bg-alert",
  }[tone];

  const spectrumClass = (i: number) =>
    i < 7 ? "bg-alert" : i < 13 ? "bg-amber" : "bg-mint";

  return (
    <div className={cx("border-3 border-ink bg-ink p-4 shadow-pixel", className)}>
      {label && (
        <p className="mb-2 font-mono text-[10px] font-bold text-cream/70">
          {label}
        </p>
      )}
      <p className="font-pixel text-4xl leading-none text-cream">
        {percent === null ? "--" : `~${Math.round(percent)}`}
        <span className="ml-1 text-xl text-cream/70">%</span>
      </p>
      {/* the meter */}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={label ?? "gauge"}
        className="mt-3 flex gap-[3px] border-2 border-cream/40 bg-ink p-[3px]"
      >
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <span
              key={i}
              className={cx(
                "h-5 flex-1",
                isFilled
                  ? spectrum
                    ? spectrumClass(i)
                    : fillClass
                  : "dither-grey opacity-30",
                isFilled && animate && "seg-fill"
              )}
              style={
                isFilled && animate
                  ? { animationDelay: `${i * 45}ms` }
                  : undefined
              }
            />
          );
        })}
      </div>
      {/* tick scale */}
      <div className="mt-1 flex justify-between font-mono text-[9px] text-cream/50">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
      {bucket && (
        <p
          className={cx(
            "mt-2 inline-block border-2 border-cream/40 px-2 py-1 font-pixel text-[10px]",
            bucket.tone === "alert" && "text-alert",
            bucket.tone === "amber" && "text-amberInk",
            bucket.tone === "mint" && "text-mint"
          )}
        >
          {bucket.label}
        </p>
      )}
      {sublabel && (
        <p className="mt-2 font-mono text-[11px] text-cream/80">{sublabel}</p>
      )}
    </div>
  );
}

export default PixelGauge;
