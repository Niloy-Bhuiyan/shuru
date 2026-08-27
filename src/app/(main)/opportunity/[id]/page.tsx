"use client";

/**
 * OPPORTUNITY DETAIL + ELIGIBILITY DECODER.
 * Full role info, every rule as a met/missing tile against the profile,
 * links to Reality Check (its own screen) and the Interview Vault,
 * Save + Mark-applied actions.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelChip } from "@/components/pixel/PixelChip";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { EligibilityChecklist } from "@/components/EligibilityChecklist";
import { ApplicationTimeline } from "@/components/ApplicationTimeline";
import { AskListing } from "@/components/AskListing";
import { MatchBreakdown } from "@/components/MatchBreakdown";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { useProfile } from "@/hooks/useProfile";
import {
  countSeniors,
  getOpportunity,
  listApplications,
  upsertApplication,
} from "@/lib/data";
import { evaluateEligibility } from "@/lib/eligibility";
import { formatDate } from "@/lib/dates";
import { useLang } from "@/lib/i18n";
import type { ApplicationStatus, Opportunity } from "@/lib/types";

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const { t } = useLang();

  const [op, setOp] = useState<Opportunity | null | undefined>(undefined);
  const [seniors, setSeniors] = useState(0);
  const [appStatus, setAppStatus] = useState<ApplicationStatus | null>(null);
  /** Needed to load the append-only history for this application. */
  const [appId, setAppId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptApplied, setPromptApplied] = useState(false);

  useEffect(() => {
    if (!profile || !id) return;
    (async () => {
      const found = await getOpportunity(id);
      setOp(found ?? null);
      if (found) {
        setSeniors(await countSeniors(profile.university, found.company));
        const apps = await listApplications();
        const mine = apps.find((a) => a.opportunity_id === found.id);
        setAppStatus(mine?.status ?? null);
        setAppId(mine?.id ?? null);
      }
    })();
  }, [profile, id]);

  async function setStatus(status: ApplicationStatus) {
    if (!op || busy) return;
    setBusy(true);
    try {
      await upsertApplication(op.id, status);
      setAppStatus(status);
    } finally {
      setBusy(false);
    }
  }

  /** Primary action: open the actual posting, then offer to record it. */
  function openPosting() {
    if (!op) return;
    if (op.source_url) {
      window.open(op.source_url, "_blank", "noreferrer");
      if (appStatus === null || appStatus === "saved") setPromptApplied(true);
    } else {
      // Nothing to open — fall back to just recording the application.
      void setStatus("applied");
    }
  }

  if (op === undefined || !profile) {
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

  const { status, checks } = evaluateEligibility(profile, op.eligibility_rules);
  const saved = appStatus !== null;
  const applied = appStatus !== null && appStatus !== "saved";

  return (
    <main className="px-4 pt-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-3 flex items-center gap-1 font-mono text-xs font-bold uppercase text-ink"
      >
        <span className="inline-block rotate-180"><PixelIcon name="arrow-right" size={11} /></span>
        {t("common.back")}
      </button>

      {/* header card */}
      <PixelCard accent={status === "qualify" ? "mint" : status === "borderline" ? "grey" : "alert"}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="font-mono text-base font-bold leading-tight text-ink">{op.role}</h1>
            <p className="mt-0.5 font-mono text-sm text-ink/70">{op.company}</p>
          </div>
          {status === "qualify" ? (
            <PixelBadge tone="qualify" icon="check">{t("badge.qualify")}</PixelBadge>
          ) : status === "borderline" ? (
            <PixelBadge tone="borderline" icon="warn">{t("badge.borderline")}</PixelBadge>
          ) : (
            <PixelBadge tone="alert" icon="x">{t("badge.ineligible")}</PixelBadge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <DeadlineBadge deadline={op.deadline} />
          <PixelBadge tone="neutral">{op.is_paid ? t("badge.paid") : t("badge.unpaid")}</PixelBadge>
          {op.is_verified && <PixelBadge tone="ink" icon="check">{t("badge.verified")}</PixelBadge>}
        </div>
      </PixelCard>

      {/* facts */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          [t("detail.deadline"), formatDate(op.deadline)],
          [t("detail.duration"), op.duration],
          [t("detail.location"), op.location],
          [t("detail.cycle"), op.cycle_label],
        ].map(([k, v]) => (
          <div key={k} className="border-2 border-ink bg-paper p-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">{k}</p>
            <p className="mt-0.5 font-mono text-xs font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      {/* seniors chip → warm intro screen */}
      {seniors > 0 && (
        <Link href={`/mentors/${op.id}`} className="mt-3 block">
          <PixelChip icon="user" className="w-full justify-between py-2">
            <span>
              {seniors} {t(seniors === 1 ? "detail.seniors.one" : "detail.seniors.many")}
            </span>
            <PixelIcon name="arrow-right" size={11} />
          </PixelChip>
        </Link>
      )}

      {/* eligibility decoder */}
      <section className="mt-5">
        <h2 className="mb-2 font-pixel text-[10px] text-ink">{t("detail.eligibility")}</h2>
        <EligibilityChecklist checks={checks} />
      </section>

      {/* reality check doorway */}
      <Link href={`/opportunity/${op.id}/reality`} className="mt-5 block">
        <div className="border-3 border-ink bg-ink p-3 shadow-pixel active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-pixel text-[10px] text-amber">{t("detail.reality")}</p>
              <p className="mt-1 font-mono text-xs font-bold text-cream">{t("detail.realityCta")}</p>
            </div>
            <PixelIcon name="arrow-right" size={16} className="text-amber" />
          </div>
        </div>
      </Link>

      {/* vault doorway */}
      <Link href={`/vault?company=${encodeURIComponent(op.company)}`} className="mt-3 block">
        <div className="border-3 border-ink bg-paper p-3 shadow-pixel-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-bold uppercase text-ink">{t("detail.vaultCta")}</p>
            <PixelIcon name="vault" size={16} className="text-ink" />
          </div>
        </div>
      </Link>

      {/* source */}
      {op.source_url && (
        <a
          href={op.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block font-mono text-xs font-bold text-amber underline"
        >
          {t("detail.source")} ↗
        </a>
      )}

      {/* match — abstains loudly rather than inventing a number */}
      <MatchBreakdown profile={profile} opportunity={op} />

      {/* history — only once an application exists to have a history */}
      {appId && <ApplicationTimeline applicationId={appId} />}

      {/* Ask — renders nothing at all when the retrieval service is not
          configured, so there is never a dead control here. */}
      <AskListing opportunityId={op.id} />

      {/* actions */}
      <div className="mt-5 flex gap-3">
        <PixelButton
          variant="secondary"
          full
          onClick={() => setStatus("saved")}
          disabled={busy || saved}
        >
          {saved ? t("common.saved") : t("common.save")}
        </PixelButton>
        {applied ? (
          <PixelButton full disabled>
            {t("common.applied")}
          </PixelButton>
        ) : op.source_url ? (
          <PixelButton full onClick={openPosting}>
            {t("detail.applyOpen")}
          </PixelButton>
        ) : (
          <PixelButton full onClick={() => setStatus("applied")} disabled={busy}>
            {t("common.apply")}
          </PixelButton>
        )}
      </div>

      {/* after opening the posting, offer to record it in the tracker */}
      {promptApplied && !applied && (
        <div className="mt-3 border-3 border-ink bg-paper p-3 shadow-pixel-sm">
          <p className="font-mono text-xs leading-snug text-ink">
            {t("detail.appliedPrompt")}
          </p>
          <div className="mt-2 flex gap-2">
            <PixelButton
              size="sm"
              onClick={async () => {
                await setStatus("applied");
                setPromptApplied(false);
              }}
              disabled={busy}
            >
              {t("common.apply")}
            </PixelButton>
            <PixelButton
              size="sm"
              variant="secondary"
              onClick={() => setPromptApplied(false)}
            >
              {t("detail.notYet")}
            </PixelButton>
          </div>
        </div>
      )}
    </main>
  );
}
