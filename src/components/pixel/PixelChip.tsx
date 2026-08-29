"use client";

import React from "react";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";

/**
 * PixelChip — tappable filter/info chip. Selected inverts to solid ink.
 *
 * Was upper-case letter-spaced mono in a hard-bordered square that shifted
 * two pixels on press. Now a pill with a real hover state; selection is still
 * carried by inversion, which survives being read at a glance in a scrolling
 * row far better than a border change would.
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
        "font-sans text-[13px] font-medium transition-colors duration-150",
        selected
          ? "border-transparent bg-ink text-white"
          : "border-ui-lineStrong bg-paper text-ui-muted",
        onClick && !selected && "hover:border-ui-faint hover:text-ink",
        className
      )}
    >
      {icon && <PixelIcon name={icon} size={10} />}
      {children}
    </Tag>
  );
}

export default PixelChip;
