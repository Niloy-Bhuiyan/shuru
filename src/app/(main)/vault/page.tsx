"use client";

/**
 * INTERVIEW VAULT — crowdsourced interview reports, filterable by
 * company. Rounds, question types, difficulty (pixel bars), apply→offer
 * timeline. Supports /vault?company=X deep links from listings.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelChip } from "@/components/pixel/PixelChip";
import { PixelSearch } from "@/components/pixel/PixelSearch";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { useLang } from "@/lib/i18n";
import { listInterviewReports } from "@/lib/data";
import { matchesReportQuery } from "@/lib/vaultSearch";
import type { InterviewReport } from "@/lib/types";

function Difficulty({ level }: { level: number }) {
  return (
    <span className="flex items-end gap-[2px]" aria-label={`Difficulty ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`w-[6px] border border-ink ${
            i < level ? (level >= 4 ? "bg-alert" : "bg-amber") : "bg-paper"
          }`}
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </span>
  );
}

function ReportCard({ r }: { r: InterviewReport }) {
  const { t } = useLang();
  return (
    <PixelCard>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-ink">{r.company}</p>
          <p className="truncate font-mono text-xs text-ink/70">{r.role}</p>
        </div>
        <Difficulty level={r.difficulty} />
      </div>

      <div className="mt-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
          {t("vault.rounds")}
        </p>
        <ol className="mt-1 space-y-1">
          {r.rounds.map((round, i) => (
            <li key={i} className="flex gap-2 font-mono text-xs text-ink">
              <span className="mt-[3px] h-2 w-2 shrink-0 border border-ink bg-amber" />
              <span>
                <span className="font-bold">{round.name}</span>
                {round.format ? ` — ${round.format}` : ""}
                {round.notes ? (
                  <span className="text-ink/70"> · {round.notes}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
          {t("vault.questions")}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {r.question_types.map((q) => (
            <PixelBadge key={q} tone="neutral">
              {q}
            </PixelBadge>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t-2 border-ink/20 pt-2 font-mono text-[11px]">
        <span className="font-bold text-ink">
          {t("vault.applyToOffer")}:{" "}
          <span className="text-amber">{r.apply_to_offer_days} {t("vault.days")}</span>
        </span>
        <span className="text-grey">{r.author_anon}</span>
      </div>
    </PixelCard>
  );
}

function VaultInner() {
  const { t } = useLang();
  const params = useSearchParams();
  const [reports, setReports] = useState<InterviewReport[] | null>(null);
  const [company, setCompany] = useState<string>(params.get("company") ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    listInterviewReports().then(setReports);
  }, []);

  const companies = useMemo(
    () => Array.from(new Set((reports ?? []).map((r) => r.company))).sort(),
    [reports]
  );

  const visible = useMemo(() => {
    return (reports ?? []).filter((r) => {
      if (company && r.company !== company) return false;
      return matchesReportQuery(r, query);
    });
  }, [reports, company, query]);

  return (
    <main className="px-4 pt-4">
      <h1 className="font-pixel text-xs text-ink">{t("vault.title")}</h1>

      <div className="mt-3">
        <PixelSearch
          value={query}
          onChange={setQuery}
          placeholder={t("vault.search")}
          ariaLabel={t("vault.search")}
          clearLabel={t("common.clear")}
        />
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <PixelChip selected={company === ""} onClick={() => setCompany("")}>
          {t("vault.all")}
        </PixelChip>
        {companies.map((c) => (
          <PixelChip key={c} selected={company === c} onClick={() => setCompany(c)}>
            {c}
          </PixelChip>
        ))}
      </div>

      <div className="mt-4 space-y-3 pb-4">
        {reports === null ? (
          <>
            <LoadingBlock />
            <LoadingBlock />
          </>
        ) : visible.length === 0 ? (
          <EmptyState icon="vault" title={t("vault.empty")} />
        ) : (
          visible.map((r) => <ReportCard key={r.id} r={r} />)
        )}
      </div>
    </main>
  );
}

export default function VaultPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 pt-4">
          <LoadingBlock />
        </main>
      }
    >
      <VaultInner />
    </Suspense>
  );
}
