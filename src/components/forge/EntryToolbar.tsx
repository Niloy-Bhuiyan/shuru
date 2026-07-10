"use client";

/**
 * Inline contextual toolbar for a focused entry (CareerZenith's hover
 * toolbar, rebuilt in pixel): move up / move down / edit / eye / delete /
 * IMPROVE WITH AI. The AI action only renders when Gemini is configured
 * (probes /api/forge-section once, shared cache with ForgeSectionButton).
 */

import React, { useEffect, useState } from "react";
import { PixelIcon, IconName } from "@/components/pixel/PixelIcon";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";

let cachedEnabled: boolean | null = null;

function IconBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex h-7 w-7 items-center justify-center border-2 border-ink",
        danger ? "bg-alert text-cream" : "bg-paper text-ink",
        "disabled:opacity-30 active:translate-x-[1px] active:translate-y-[1px]"
      )}
    >
      <PixelIcon name={icon} size={12} />
    </button>
  );
}

export function EntryToolbar({
  onUp,
  onDown,
  onEdit,
  onEye,
  onDelete,
  onImprove,
  improving,
  className,
}: {
  onUp?: () => void;
  onDown?: () => void;
  onEdit?: () => void;
  onEye?: () => void;
  onDelete?: () => void;
  onImprove?: () => void;
  improving?: boolean;
  className?: string;
}) {
  const { t } = useLang();
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(cachedEnabled);

  useEffect(() => {
    if (cachedEnabled !== null) return;
    fetch("/api/forge-section")
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => {
        cachedEnabled = d.enabled;
        setAiEnabled(d.enabled);
      })
      .catch(() => {
        cachedEnabled = false;
        setAiEnabled(false);
      });
  }, []);

  return (
    <div
      className={cx(
        "inline-flex items-center gap-1 border-2 border-ink bg-ink p-1 shadow-pixel-sm",
        className
      )}
    >
      {aiEnabled && onImprove && (
        <button
          type="button"
          onClick={onImprove}
          disabled={improving}
          className="flex items-center gap-1 border-2 border-ink bg-amber px-1.5 py-1 font-mono text-[10px] font-bold uppercase text-ink disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px]"
        >
          <PixelIcon name="spark" size={11} />
          {improving ? t("forge.forging") : t("forge.improve")}
        </button>
      )}
      {onUp !== undefined && <IconBtn icon="arrow-up" label="Move up" onClick={onUp} disabled={!onUp} />}
      {onDown !== undefined && <IconBtn icon="arrow-down" label="Move down" onClick={onDown} disabled={!onDown} />}
      {onEdit && <IconBtn icon="edit" label="Edit" onClick={onEdit} />}
      {onEye && <IconBtn icon="eye" label="Preview" onClick={onEye} />}
      {onDelete && <IconBtn icon="x" label="Delete" onClick={onDelete} danger />}
    </div>
  );
}

export default EntryToolbar;
