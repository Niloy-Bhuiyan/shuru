"use client";

/**
 * WIZARD STEP 3 — YOUR SCORE. One focused reveal, not a wall:
 *   - readiness meter (existing PixelGauge spectrum mode + bucket label)
 *   - THE one thing to fix: the heaviest failing check, with its reason
 *   - FIX THIS → jumps straight into the BUILD section that owns it
 *   - LOOKS GOOD, CONTINUE → on to TAILOR
 * A "see all issues" expander reuses the existing SuggestedActions queue
 * (pending / completed / deleted, with the same persistence).
 */

import React, { useMemo, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelGauge } from "@/components/pixel/PixelGauge";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import {
  CHECK_REASON,
  CHECK_TARGET,
  SuggestedActions,
} from "@/components/forge/SuggestedActions";
import { computeAts } from "@/lib/resume/ats";
import { useLang } from "@/lib/i18n";
import type { ResumeContent, ResumeSectionKey } from "@/lib/types";

export function StepScore({
  content,
  dismissed,
  onDismiss,
  onRestore,
  onFix,
  onContinue,
}: {
  content: ResumeContent;
  dismissed: string[];
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onFix: (section: ResumeSectionKey) => void;
  onContinue: () => void;
}) {
  const { t } = useLang();
  const [showAll, setShowAll] = useState(false);

  const ats = useMemo(() => computeAts(content), [content]);

  const pending = ats.checks.filter(
    (c) => c.state === "missing" && !dismissed.includes(c.id)
  );
  // the heaviest failing check = the biggest single score gain available
  const top = [...pending].sort((a, b) => b.weight - a.weight)[0] ?? null;

  const bucket =
    ats.score < 40
      ? { label: t("forge.needsWork"), tone: "alert" as const }
      : ats.score < 70
        ? { label: t("forge.okayish"), tone: "amber" as const }
        : { label: t("forge.strong"), tone: "mint" as const };

  return (
    <div className="mt-4 space-y-4">
      <PixelGauge
        percent={ats.score}
        spectrum
        label={t("forge.readiness")}
        bucket={bucket}
        sublabel={`${ats.wordCount} ${t("forge.words")}`}
      />

      {top ? (
        <div className="border-3 border-ink bg-paper p-3 shadow-pixel">
          <p className="font-pixel text-[9px] text-amber">{t("forge.oneThing")}</p>
          <p className="mt-2 font-mono text-sm font-bold text-ink">{top.label}</p>
          <p className="mt-1 font-mono text-xs leading-relaxed text-ink/80">{top.detail}</p>
          <p className="mt-2 border-l-4 border-amber pl-2 font-mono text-[11px] leading-snug text-grey">
            {CHECK_REASON[top.id]}
          </p>
          <div className="mt-3 flex gap-2">
            <PixelButton full onClick={() => onFix(CHECK_TARGET[top.id])}>
              {t("forge.fixThis")} <PixelIcon name="arrow-right" size={10} className="ml-1 inline-block" />
            </PixelButton>
            <PixelButton full variant="secondary" onClick={onContinue}>
              {t("forge.looksGood")}
            </PixelButton>
          </div>
        </div>
      ) : (
        <div className="border-3 border-ink bg-mint p-3 shadow-pixel">
          <p className="flex items-center gap-1.5 font-mono text-xs font-bold text-ink">
            <PixelIcon name="check" size={12} /> {t("forge.allClear")}
          </p>
          <PixelButton full variant="positive" className="mt-3" onClick={onContinue}>
            {t("forge.looksGood")} →
          </PixelButton>
        </div>
      )}

      {/* full queue, tucked away until asked for */}
      <div>
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          aria-expanded={showAll}
          className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-grey"
        >
          <span className={showAll ? "inline-block rotate-180" : "inline-block"}>
            <PixelIcon name="chevron" size={10} />
          </span>
          {showAll ? t("forge.hideAll") : `${t("forge.seeAll")} (${pending.length})`}
        </button>
        {showAll && (
          <div className="mt-3">
            <SuggestedActions
              checks={ats.checks}
              dismissed={dismissed}
              onDismiss={onDismiss}
              onRestore={onRestore}
              onFix={onFix}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StepScore;
