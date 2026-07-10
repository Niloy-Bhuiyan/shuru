import React from "react";
import { cx } from "@/lib/cx";
import { PixelIcon } from "./PixelIcon";

/**
 * PixelCheckTile — one eligibility rule as a full-width tile.
 *  met      → solid mint, pixel check
 *  missing  → dithered warm grey, pixel warn
 *  unknown  → paper, grey warn (rule can't be evaluated from profile)
 */
export function PixelCheckTile({
  state,
  label,
  detail,
  className,
}: {
  state: "met" | "missing" | "unknown";
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 border-3 border-ink p-3",
        state === "met" && "bg-mint",
        state === "missing" && "dither-grey bg-cream",
        state === "unknown" && "bg-paper",
        className
      )}
    >
      <span
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 border-ink",
          state === "met" ? "bg-paper text-ink" : "bg-ink text-cream"
        )}
      >
        <PixelIcon name={state === "met" ? "check" : "warn"} size={12} />
      </span>
      <div className="min-w-0">
        <p
          className={cx(
            "font-mono text-xs font-bold uppercase tracking-wide",
            state === "missing" ? "text-ink" : "text-ink"
          )}
        >
          {label}
        </p>
        {detail && (
          <p className="mt-0.5 break-words font-mono text-[11px] leading-snug text-ink/80">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

export default PixelCheckTile;
