"use client";

import React from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "positive" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * PixelButton — chunky bordered button with a hard offset shadow.
 * Pressing it physically "pushes it in": translate + shadow collapse.
 */
export function PixelButton({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled,
  full,
  onClick,
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  type?: "button" | "submit";
  disabled?: boolean;
  full?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const variantClass: Record<Variant, string> = {
    primary: "bg-amber text-ink",
    secondary: "bg-paper text-ink",
    positive: "bg-mint text-ink",
    danger: "bg-alert text-cream",
    ghost: "bg-transparent text-ink shadow-pixel-none",
  };
  const sizeClass: Record<Size, string> = {
    sm: "px-2 py-1 text-[11px]",
    md: "px-4 py-2 text-xs",
    lg: "px-5 py-3 text-sm",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "border-3 border-ink font-mono font-bold uppercase tracking-wider shadow-pixel",
        "active:translate-x-[3px] active:translate-y-[3px] active:shadow-pixel-none",
        variantClass[variant],
        sizeClass[size],
        full && "w-full",
        disabled &&
          "cursor-not-allowed bg-grey text-cream opacity-70 shadow-pixel-sm active:translate-x-0 active:translate-y-0",
        className
      )}
    >
      {children}
    </button>
  );
}

export default PixelButton;
