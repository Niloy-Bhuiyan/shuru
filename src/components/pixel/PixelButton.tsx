"use client";

import React from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "positive" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * PixelButton — the app's button.
 *
 * The name is now historical. It used to be a chunky bordered control with a
 * hard offset shadow that collapsed on press, in upper-case letter-spaced
 * mono. Renaming it would have meant touching every call site, so the file
 * kept its name and changed its clothes; the props are unchanged.
 *
 * `primary` is navy rather than amber. Amber is the brand colour and stays
 * the accent, but a page where every action is a saturated orange fill has no
 * hierarchy left — and `text-ink` on #EA580C measures 4.0:1, under AA. Navy
 * with white carries 16:1, and amber survives as the highlight it should be.
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
    primary: "border-transparent bg-ink text-white hover:opacity-90",
    secondary:
      "border-ui-lineStrong bg-paper text-ink hover:bg-cream",
    positive: "border-transparent bg-mint text-white hover:opacity-90",
    danger: "border-transparent bg-alert text-white hover:opacity-90",
    ghost:
      "border-transparent bg-transparent text-ui-muted hover:bg-cream hover:text-ink",
  };
  const sizeClass: Record<Size, string> = {
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-4 py-2 text-[14px]",
    lg: "px-5 py-2.5 text-[15px]",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-sans font-medium",
        "transition-colors duration-150",
        variantClass[variant],
        sizeClass[size],
        full && "w-full",
        disabled &&
          "cursor-not-allowed border-ui-line bg-ui-raised text-ui-faint hover:bg-ui-raised hover:opacity-100",
        className
      )}
    >
      {children}
    </button>
  );
}

export default PixelButton;
