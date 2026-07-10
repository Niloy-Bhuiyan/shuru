import React from "react";
import { PixelIcon, IconName } from "@/components/pixel/PixelIcon";

/** Pixel empty state — an invitation to act, not an error. */
export function EmptyState({
  icon = "signal",
  title,
  hint,
  children,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-3 border-ink bg-paper p-5 text-center shadow-pixel">
      <span className="mx-auto flex h-10 w-10 items-center justify-center border-2 border-ink bg-cream text-grey">
        <PixelIcon name={icon} size={18} />
      </span>
      <p className="mt-3 font-mono text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 font-mono text-xs text-grey">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default EmptyState;
