"use client";

import React from "react";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";

/**
 * PixelChip — tappable filter/info chip. Selected = inverted (ink on cream).
 */
export function PixelChip({
  children,
  selected = false,
  onClick,
  icon,
  className,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: IconName;
  className?: string;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      type={onClick ? "button" : undefined}
      aria-pressed={onClick ? selected : undefined}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 border-2 border-ink px-2 py-1",
        "font-mono text-[11px] font-bold uppercase tracking-wide",
        selected ? "bg-ink text-cream shadow-pixel-sm" : "bg-paper text-ink",
        onClick &&
          "active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none",
        className
      )}
    >
      {icon && <PixelIcon name={icon} size={10} />}
      {children}
    </Tag>
  );
}

export default PixelChip;
