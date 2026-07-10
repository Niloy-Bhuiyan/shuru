"use client";

import React from "react";
import { PixelCheckTile } from "@/components/pixel/PixelCheckTile";
import type { EligibilityCheck } from "@/lib/eligibility";
import { useLang } from "@/lib/i18n";

/** The decoder: every rule as a met/missing/unknown pixel tile. */
export function EligibilityChecklist({
  checks,
}: {
  checks: EligibilityCheck[];
}) {
  const { t } = useLang();

  if (checks.length === 0) {
    return (
      <p className="border-3 border-ink bg-mint p-3 font-mono text-xs font-bold text-ink">
        {t("detail.noRules")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {checks.map((c) => (
        <PixelCheckTile
          key={c.id}
          state={c.state}
          label={c.label}
          detail={c.detail}
        />
      ))}
    </div>
  );
}

export default EligibilityChecklist;
