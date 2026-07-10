import React from "react";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";

type Tone = "qualify" | "borderline" | "urgent" | "alert" | "neutral" | "ink";

/**
 * PixelBadge — small status label. Color carries MEANING:
 *  qualify=mint, borderline/uncertain=grey, urgency=amber, danger=alert.
 */
export function PixelBadge({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}) {
  const toneClass: Record<Tone, string> = {
    qualify: "bg-mint text-ink",
    borderline: "bg-grey text-cream",
    urgent: "bg-amber text-ink",
    alert: "bg-alert text-cream",
    neutral: "bg-paper text-ink",
    ink: "bg-ink text-cream",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 border-2 border-ink px-1.5 py-0.5",
        "font-mono text-[10px] font-bold uppercase tracking-wide",
        toneClass[tone],
        className
      )}
    >
      {icon && <PixelIcon name={icon} size={10} />}
      {children}
    </span>
  );
}

export default PixelBadge;
