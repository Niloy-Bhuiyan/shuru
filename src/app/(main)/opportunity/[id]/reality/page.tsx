"use client";

/**
 * REALITY CHECK — the signature screen.
 * Enough similar outcomes → the chunky PixelGauge with confidence readout,
 * THE ONE THING panel, ALREADY IN YOUR FAVOUR panel, optional EXPLAIN THIS.
 * Too few (n < 8) → the AbstentionTerminal. Never a fake number.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PixelGauge } from "@/components/pixel/PixelGauge";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { AbstentionTerminal } from "@/components/AbstentionTerminal";
import { ExplainButton } from "@/components/ExplainButton";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { useProfile } from "@/hooks/useProfile";
import {
  countSeniors,
  getOpportunity,
  isDemoMode,
  isSeededOpportunity,
  listInterviewReports,
  listOutcomes,
} from "@/lib/data";
import {
  realityCheck,
  snapshotFromProfile,
  type RealityCheckResult,
  type FeatureGap,
} from "@/lib/realityCheck";
import { useLang } from "@/lib/i18n";
import type { Opportunity } from "@/lib/types";
import { PixelButton } from "@/components/pixel/PixelButton";

function GapPanel({
  title,
  gap,
  tone,
}: {
  title: string;
  gap: FeatureGap;
  tone: "amber" | "mint";
}) {
  const { t } = useLang();
  return (
    <div
      className={`border-3 border-ink p-3 shadow-pixel ${
        tone === "amber" ? "bg-amber" : "bg-mint"
      }`}
    >
      <p className="font-pixel text-[9px] leading-relaxed text-ink">{title}</p>
      <p className="mt-2 font-mono text-sm font-bold text-ink">{gap.label}</p>
      <p className="mt-1 font-mono text-xs text-ink/80">{gap.fixHint}</p>
      <div className="mt-2 flex gap-2 font-mono text-[11px] font-bold text-ink">
        <span className="border-2 border-ink bg-paper px-1.5 py-0.5">
          {t("reality.with")}: {Math.round(gap.rateWith * 100)}% {t("reality.rate")}
        </span>
        <span className="border-2 border-ink bg-paper px-1.5 py-0.5">
          {t("reality.without")}: {Math.round(gap.rateWithout * 100)}%
        </span>
      </div>
    </div>
  );
}

export default function RealityCheckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const { t } = useLang();

  const [op, setOp] = useState<Opportunity | null | undefined>(undefined);
  const [rc, setRc] = useState<RealityCheckResult | null>(null);
  const [seniors, setSeniors] = useState(0);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    if (!profile || !id) return;
    // `cancelled` guards against a stale response committing state for an
    // opportunity the user has already navigated away from (fast id changes).
    let cancelled = false;
    (async () => {
      try {
        const found = await getOpportunity(id);
        if (cancelled) return;
        setOp(found ?? null);
        if (!found) return;
        const [outcomes, s, reports] = await Promise.all([
          listOutcomes(found.id),
          countSeniors(profile.university, found.company),
          listInterviewReports(found.company),
        ]);
        if (cancelled) return;
        setSeniors(s);
        setReportCount(reports.length);
        setRc(realityCheck(snapshotFromProfile(profile), outcomes));
      } catch {
        // Surface a terminal state (the not-found screen has a back action)
        // instead of hanging on the loader forever.
        if (!cancelled) setOp(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, id]);

  if (op === undefined || !profile || (op && !rc)) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }
  if (op === null) {
    return (
      <main className="px-4 pt-4">
        <EmptyState icon="x" title={t("detail.notFound")}>
          <PixelButton variant="secondary" onClick={() => router.push("/radar")}>
            ← {t("nav.radar")}
          </PixelButton>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="px-4 pt-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-3 flex items-center gap-1 font-mono text-xs font-bold uppercase text-ink"
      >
        <span className="inline-block rotate-180">
          <PixelIcon name="arrow-right" size={11} />
        </span>
        {t("common.back")}
      </button>

      <h1 className="font-pixel text-xs text-ink">{t("detail.reality")}</h1>
      <p className="mt-1 font-mono text-xs text-ink/70">
        {op.role} · {op.company}
      </p>

      {(isDemoMode() || isSeededOpportunity(op.id)) && (
        <div className="mt-3 flex items-start gap-2 border-3 border-ink bg-paper p-2.5 shadow-pixel-sm">
          <span className="mt-0.5 border-2 border-ink bg-grey px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-cream">
            {t("reality.sampleBadge")}
          </span>
          <p className="font-mono text-[11px] leading-snug text-ink">
            {t("reality.sampleNote")}
          </p>
        </div>
      )}

      <div className="mt-4">
        {rc!.kind === "abstain" ? (
          <AbstentionTerminal
            op={op}
            n={rc!.n}
            needed={rc!.needed}
            seniors={seniors}
            reportCount={reportCount}
          />
        ) : (
          <>
            <PixelGauge
              percent={rc!.percent}
              tone="amber"
              animate
              label={t("reality.odds")}
              sublabel={`${t("reality.confidence")}: ${rc!.confidence} · ${rc!.n} ${t("reality.similar")}`}
            />

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <PixelBadge tone={rc!.confidence === "HIGH" ? "qualify" : "urgent"}>
                {t("reality.confidence")}: {rc!.confidence}
              </PixelBadge>
              <PixelBadge tone="neutral" icon="signal">
                {rc!.cohort === "band+dept"
                  ? t("reality.cohort.deptband")
                  : t("reality.cohort.band")}
              </PixelBadge>
            </div>

            <ExplainButton
              payload={{
                company: op.company,
                role: op.role,
                percent: rc!.percent,
                confidence: rc!.confidence,
                n: rc!.n,
                oneThing: rc!.oneThing?.label ?? null,
                inYourFavour: rc!.inYourFavour?.label ?? null,
              }}
            />

            <div className="mt-4 space-y-3">
              {rc!.oneThing && (
                <GapPanel title={t("reality.oneThing")} gap={rc!.oneThing} tone="amber" />
              )}
              {rc!.inYourFavour && (
                <GapPanel title={t("reality.favour")} gap={rc!.inYourFavour} tone="mint" />
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-6 border-t-2 border-ink/20 pt-3 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-grey">
        {t("reality.footer")}
      </p>
    </main>
  );
}
