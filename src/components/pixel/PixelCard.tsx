import React from "react";
import { cx } from "@/lib/cx";

/**
 * PixelCard — the base surface.
 *
 * Was a 3px ink border with a hard 4px offset shadow and notched corners; now
 * a white panel on the tinted page with a hairline rule and a short shadow.
 * Props unchanged, including the optional accent stripe — that stripe is one
 * of the few places the status colours appear at full strength, so it kept
 * its job and only lost the checkerboard.
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
      ? "bg-amber"
      : accent === "mint"
        ? "bg-mint"
        : accent === "grey"
          ? "bg-grey"
          : accent === "alert"
            ? "bg-alert"
            : null;

  return (
    <Tag
      onClick={onClick}
      className={cx(
        "relative block w-full overflow-hidden rounded-xl border border-ui-line bg-paper text-left shadow-pixel",
        onClick && "transition-shadow duration-150 hover:shadow-pixel-lg",
        className
      )}
    >
      {accentClass && (
        <span
          aria-hidden
          className={cx("absolute inset-y-0 left-0 w-[3px]", accentClass)}
        />
      )}
      <div className={cx("p-4", accentClass && "pl-5")}>{children}</div>
    </Tag>
  );
}

export default PixelCard;
