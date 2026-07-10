"use client";

/**
 * Bullet-list editor (extracted unchanged from the old forge dashboard):
 * one input row per bullet, amber pixel tick, remove per row, add at end.
 */

import React from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { useLang } from "@/lib/i18n";

export function BulletsEditor({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (b: string[]) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-2">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 border border-ink bg-amber" />
          <input
            value={b}
            aria-label={`Bullet ${i + 1}`}
            onChange={(e) => {
              const next = [...bullets];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-xs text-ink focus:outline-none focus:shadow-pixel-sm"
          />
          <button
            type="button"
            aria-label={t("forge.remove")}
            onClick={() => onChange(bullets.filter((_, j) => j !== i))}
            className="text-grey"
          >
            <PixelIcon name="x" size={11} />
          </button>
        </div>
      ))}
      <PixelButton size="sm" variant="ghost" onClick={() => onChange([...bullets, ""])}>
        + {t("forge.addBullet")}
      </PixelButton>
    </div>
  );
}

export default BulletsEditor;
