"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { useLang } from "@/lib/i18n";
import { isSeededOpportunity } from "@/lib/data";
import type { Opportunity } from "@/lib/types";
import type { EligibilityStatus } from "@/lib/eligibility";
import type { RealityCheckResult } from "@/lib/realityCheck";
import { daysLeft, isEstimatedDeadline } from "@/lib/dates";

export type EnrichedOpportunity = {
  op: Opportunity;
  status: EligibilityStatus;
  seniors: number;
  rc: RealityCheckResult;
};

/** One radar card: role/company · countdown · eligibility · seniors · odds. */
/** A listing is promoted while `featured_until` is still in the future. */
function isPromoted(op: Opportunity): boolean {
  return Boolean(op.featured_until && new Date(op.featured_until) > new Date());
}

export function OpportunityCard({ item }: { item: EnrichedOpportunity }) {
  const router = useRouter();
  const { t } = useLang();
  const { op, status, rc } = item;
  const urgent = !isEstimatedDeadline(op) && daysLeft(op.deadline) < 3;
  // Odds shown for a seeded row come from fabricated sample outcomes.
  const illustrative = isSeededOpportunity(op.id);

  return (
    <PixelCard
      as="button"
      onClick={() => router.push(`/opportunity/${op.id}`)}
      accent={status === "qualify" ? "mint" : status === "borderline" ? "grey" : "alert"}
      className={urgent ? "shadow-pixel-amber" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-ink">{op.role}</p>
          <p className="truncate font-mono text-xs text-ink/70">
            {op.company} · {op.location}
          </p>
        </div>
        {status === "qualify" ? (
          <PixelBadge tone="qualify" icon="check">{t("badge.qualify")}</PixelBadge>
        ) : status === "borderline" ? (
          <PixelBadge tone="borderline" icon="warn">{t("badge.borderline")}</PixelBadge>
        ) : (
          <PixelBadge tone="alert" icon="x">{t("badge.ineligible")}</PixelBadge>
        )}
      </div>

      {/* Keep the card to three signals: eligibility (above) · deadline · odds.
          Paid / verified / seniors live on the opportunity detail screen. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DeadlineBadge deadline={op.deadline} estimated={isEstimatedDeadline(op)} />
        {/*
          Paid placement that announces itself is honest; paid placement that
          blends in is not. The badge travels with the card so it is still
          visible on screens (Saved) that have no promoted section around it.
        */}
        {isPromoted(op) && (
          <span className="border-2 border-ink bg-amber px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink">
            {t("pay.promoted")}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t-2 border-ink/20 pt-2">
        {rc.kind === "odds" ? (
          <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-ink">
            ~{rc.percent}% {t("odds.shortlist")}
            {illustrative && (
              <span className="border border-ink/40 px-1 font-mono text-[8px] font-bold text-grey">
                {t("reality.sampleBadge")}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1 font-mono text-xs font-bold text-grey">
            <PixelIcon name="signal" size={11} /> {t("odds.low_signal")}
          </span>
        )}
        <span className="flex items-center gap-1 font-mono text-[11px] font-bold text-amberInk">
          {t("detail.reality")} <PixelIcon name="arrow-right" size={11} />
        </span>
      </div>
    </PixelCard>
  );
}

export default OpportunityCard;
