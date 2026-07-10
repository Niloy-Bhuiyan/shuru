import React from "react";
import { cx } from "@/lib/cx";

/**
 * PixelCard — the base surface. Chunky 3px ink border, hard 4px offset
 * shadow, notched pixel corners. Optional dithered accent band on the left.
 */
export function PixelCard({
  children,
  accent,
  className,
  as: Tag = "div",
  onClick,
}: {
  children: React.ReactNode;
  accent?: "amber" | "mint" | "grey" | "alert";
  className?: string;
  as?: "div" | "article" | "section" | "button";
  onClick?: () => void;
}) {
  const accentClass =
    accent === "amber"
      ? "dither-amber"
      : accent === "mint"
        ? "dither-mint"
        : accent === "grey"
          ? "dither-grey"
          : accent === "alert"
            ? "dither-alert"
            : null;

  return (
    <Tag
      onClick={onClick}
      className={cx(
        "relative block w-full border-3 border-ink bg-paper text-left shadow-pixel",
        onClick &&
          "transition-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none",
        className
      )}
    >
      {accentClass && (
        <span
          aria-hidden
          className={cx("absolute inset-y-0 left-0 w-[6px]", accentClass)}
        />
      )}
      <div className={cx("p-3", accentClass && "pl-4")}>{children}</div>
    </Tag>
  );
}

export default PixelCard;
