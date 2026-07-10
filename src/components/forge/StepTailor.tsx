"use client";

/**
 * WIZARD STEP 4 — TAILOR (optional, loudly skippable). Paste a JD, run the
 * existing keyword matcher, get the match % and missing-keyword chips. The
 * result stays LIVE against the resume: accept an AI rewrite (or loop back
 * and edit) and the % moves immediately (recomputed on content change
 * against the last-run JD — the audit-3.2 behavior, preserved).
 * IMPROVE MATCH runs the existing AI improve on the Summary with this JD;
 * it only exists when an AI key is configured (same probe as the agent).
 */

import React, { useMemo, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { jdMatch } from "@/lib/resume/jdMatch";
import { useAgentEnabled } from "@/hooks/useAgentEnabled";
import { useLang } from "@/lib/i18n";
import type { EntryRef } from "@/components/forge/ResumePreview";
import type { ResumeContent } from "@/lib/types";

export function StepTailor({
  content,
  jd,
  setJd,
  onImprove,
  improving,
  onContinue,
}: {
  content: ResumeContent;
  jd: string;
  setJd: (v: string) => void;
  onImprove: (ref: EntryRef) => void;
  improving: boolean;
  onContinue: () => void;
}) {
  const { t } = useLang();
  const aiEnabled = useAgentEnabled();
  /** the JD the user last RAN — results stay live against this */
  const [ranJd, setRanJd] = useState("");

  const result = useMemo(
    () => (ranJd.trim() ? jdMatch(content, ranJd) : null),
    [content, ranJd]
  );

  return (
    <div className="mt-4 space-y-4">
      <p className="border-l-4 border-amber pl-2 font-mono text-[11px] leading-snug text-grey">
        {t("forge.tailorHint")}
      </p>

      <div>
        <textarea
          value={jd}
          aria-label={t("forge.jd")}
          onChange={(e) => setJd(e.target.value)}
          rows={5}
          placeholder={t("forge.jdPlaceholder")}
          className="w-full border-3 border-ink bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink placeholder:text-grey focus:outline-none focus:shadow-pixel-sm"
        />
        <PixelButton size="sm" className="mt-2" onClick={() => setRanJd(jd)} disabled={!jd.trim()}>
          {t("forge.jdRun")}
        </PixelButton>
      </div>

      {result && (
        <div className="border-3 border-ink bg-ink p-3 shadow-pixel">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-cream/70">
            {t("forge.jdMatch")}
          </p>
          <p className="mt-1 font-pixel text-2xl text-cream">
            {result.percent}
            <span className="text-base text-cream/70">%</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-cream/80">
            {result.matched.length}/{result.totalKeywords} {t("forge.jdCovered")}
          </p>
          {result.missing.length > 0 && (
            <>
              <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-widest text-amber">
                {t("forge.jdMissing")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.missing.map((k) => (
                  <span
                    key={k}
                    className="border-2 border-amber bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </>
          )}
          {aiEnabled && (
            <PixelButton
              size="sm"
              className="mt-3"
              onClick={() => onImprove({ kind: "summary" })}
              disabled={improving || !content.summary.trim()}
            >
              <span className="flex items-center gap-1">
                <PixelIcon name="spark" size={11} />
                {improving ? t("forge.forging") : t("forge.improveMatch")}
              </span>
            </PixelButton>
          )}
        </div>
      )}

      {result ? (
        <PixelButton full variant="positive" onClick={onContinue}>
          {t("forge.continueStep")} →
        </PixelButton>
      ) : (
        <PixelButton full variant="secondary" onClick={onContinue}>
          {t("forge.skipStep")} →
        </PixelButton>
      )}
    </div>
  );
}

export default StepTailor;
