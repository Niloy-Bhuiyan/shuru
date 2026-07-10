"use client";

import React from "react";
import { cx } from "@/lib/cx";
import { PixelIcon } from "@/components/pixel/PixelIcon";

/**
 * PixelSearch — the reusable free-text search box, extracted from Radar's
 * inline box (chunky border, pixel search glyph, clear affordance). Fully
 * controlled; callers pass already-translated placeholder / labels.
 */
export function PixelSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel = "Clear",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  clearLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 border-3 border-ink bg-paper px-3 py-2 shadow-pixel-sm",
        className
      )}
    >
      <PixelIcon name="search" size={14} className="shrink-0 text-ink" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-full bg-transparent font-mono text-sm text-ink placeholder:text-grey focus:outline-none"
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange("")}
          className="active:translate-x-[1px] active:translate-y-[1px]"
        >
          <PixelIcon name="x" size={12} className="text-grey" />
        </button>
      )}
    </div>
  );
}

export default PixelSearch;
