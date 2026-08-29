import React from "react";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";

type Tone = "qualify" | "borderline" | "urgent" | "alert" | "neutral" | "ink";

/**
 * PixelBadge — small status label. Colour carries MEANING:
 * qualify=positive, borderline/uncertain=muted, urgency=amber, danger=alert.
 *
 * Tones were solid saturated fills with a 2px border. A row of those reads as
 * a warning strip whatever it says, which is the wrong volume for a label
 * that is often just "Remote" or "Part-time". They are soft tints now, with
 * the hue doing the signalling and the text carrying its own AA contrast
 * against the tint rather than against white.
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
    qualify: "bg-mint/10 text-[#047857]",
    borderline: "bg-grey/10 text-ui-muted",
    urgent: "bg-amber/10 text-amberInk",
    alert: "bg-alert/10 text-[#B91C1C]",
    neutral: "bg-cream text-ui-muted",
    ink: "bg-ink text-white",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5",
        "font-sans text-[12px] font-medium",
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
