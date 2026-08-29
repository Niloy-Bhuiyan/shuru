"use client";

/**
 * SUGGESTED ACTIONS — the ATS checklist reframed as an actionable queue
 * (CareerZenith's Pending / Completed / Deleted structure, in pixel form).
 *  - Pending  = failing checks. Fix → opens the responsible editor section.
 *  - Completed = passing checks (read-only, satisfying).
 *  - Deleted  = issues the user dismissed (restorable; persisted locally).
 * Each pending card: FIX, eye (expand the Reason), delete.
 */

import React, { useState } from "react";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { cx } from "@/lib/cx";
import { useLang } from "@/lib/i18n";
import type { AtsCheck } from "@/lib/resume/ats";
import type { ResumeSectionKey } from "@/lib/types";

export const CHECK_TARGET: Record<AtsCheck["id"], ResumeSectionKey> = {
  contact: "contact",
  headers: "summary",
  bullets: "experience",
  quantified: "experience",
  verbs: "experience",
  length: "summary",
  format: "summary",
};

export const CHECK_REASON: Record<AtsCheck["id"], string> = {
  contact:
    "ATS parsers index you by name, email and phone. If one is missing or malformed, your resume can be filed under nobody.",
  headers:
    "Screeners map content by standard section names. Missing sections read as missing qualifications.",
  bullets:
    "Recruiters skim 6–8 seconds per entry. Fewer than 2 bullets looks thin; more than 6 buries the signal.",
  quantified:
    "Numbers are the fastest credibility signal a screener can verify. Aim for a metric in at least 1 of every 3 bullets.",
  verbs:
    "Bullets that open with Built / Deployed / Reduced read as achievements. Openers like 'Responsible for' read as duties.",
  length:
    "For internships, one clean page wins. Too short reads unfinished; too long gets truncated by parsers.",
  format:
    "Pipes, tabs and ALL-CAPS lines confuse text extraction — the same extraction this app's upload feature uses.",
};

type Tab = "pending" | "completed" | "deleted";

export function SuggestedActions({
  checks,
  dismissed,
  onDismiss,
  onRestore,
  onFix,
}: {
  checks: AtsCheck[];
  dismissed: string[];
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onFix: (target: ResumeSectionKey) => void;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("pending");
  const [openReason, setOpenReason] = useState<string | null>(null);

  const pending = checks.filter(
    (c) => c.state === "missing" && !dismissed.includes(c.id)
  );
  const completed = checks.filter((c) => c.state === "met");
  const deleted = checks.filter((c) => dismissed.includes(c.id));

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "pending", label: t("forge.pending"), count: pending.length },
    { id: "completed", label: t("forge.completed"), count: completed.length },
    { id: "deleted", label: t("forge.deletedTab"), count: deleted.length },
  ];

  const list = tab === "pending" ? pending : tab === "completed" ? completed : deleted;

  return (
    <div>
      <div className="flex gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className={cx(
              "flex items-center gap-1.5 border-2 border-ink px-2 py-1 font-mono text-[11px] font-bold",
              tab === x.id ? "bg-amber text-ink shadow-pixel-sm" : "bg-paper text-ink"
            )}
          >
            {x.label}
            <span className="border border-ink bg-ink px-1 text-[10px] text-cream">
              {x.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {list.length === 0 && (
          <p className="border-3 border-ink bg-paper p-3 text-center font-mono text-xs text-grey">
            {t("forge.noActions")}
          </p>
        )}
        {list.map((c) => (
          <div key={c.id} className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {tab === "pending" ? (
                    <PixelBadge tone="urgent" icon="warn">!</PixelBadge>
                  ) : tab === "completed" ? (
                    <PixelBadge tone="qualify" icon="check">✓</PixelBadge>
                  ) : (
                    <PixelBadge tone="borderline" icon="x">–</PixelBadge>
                  )}
                  <p className="font-mono text-xs font-bold text-ink">{c.label}</p>
                </div>
                <p className="mt-1 font-mono text-[11px] leading-snug text-ink/80">
                  {c.detail}
                </p>
              </div>

              {tab === "pending" && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onFix(CHECK_TARGET[c.id])}
                    className="flex items-center gap-1 border-2 border-ink bg-amber px-2 py-1 font-mono text-[10px] font-bold text-ink active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    {t("forge.fix")} <PixelIcon name="arrow-right" size={9} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("forge.reason")}
                    onClick={() => setOpenReason(openReason === c.id ? null : c.id)}
                    className="flex h-7 w-7 items-center justify-center border-2 border-ink bg-paper text-ink"
                  >
                    <PixelIcon name="eye" size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => onDismiss(c.id)}
                    className="flex h-7 w-7 items-center justify-center border-2 border-ink bg-alert text-cream"
                  >
                    <PixelIcon name="x" size={11} />
                  </button>
                </div>
              )}
              {tab === "deleted" && (
                <button
                  type="button"
                  onClick={() => onRestore(c.id)}
                  className="shrink-0 border-2 border-ink bg-paper px-2 py-1 font-mono text-[10px] font-bold text-ink"
                >
                  {t("forge.restore")}
                </button>
              )}
            </div>

            {tab === "pending" && openReason === c.id && (
              <div className="mt-2 border-2 border-ink/40 bg-cream p-2">
                <p className="font-mono text-[10px] font-bold text-grey">
                  {t("forge.reason")}
                </p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink">
                  {CHECK_REASON[c.id]}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SuggestedActions;
