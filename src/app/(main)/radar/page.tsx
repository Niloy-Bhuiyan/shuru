"use client";

/**
 * RADAR (home) — animated pixel sunrise + greeting, then a feed of the
 * doors that are actually open for you, sorted by deadline urgency.
 * Live search + filter chips. Ineligible listings hidden by default.
 */

import { useEffect, useMemo, useState } from "react";
import { SunriseHero } from "@/components/SunriseHero";
import { OpportunityCard, EnrichedOpportunity } from "@/components/OpportunityCard";
import type { Opportunity } from "@/lib/types";
import { RadarIntro } from "@/components/RadarIntro";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelChip } from "@/components/pixel/PixelChip";
import { PixelSearch } from "@/components/pixel/PixelSearch";
import { useProfile } from "@/hooks/useProfile";
import {
  countSeniorsByCompany,
  listOpportunities,
  listOutcomesForOpportunities,
} from "@/lib/data";
import { evaluateEligibility } from "@/lib/eligibility";
import { realityCheck, snapshotFromProfile } from "@/lib/realityCheck";
import { daysLeft } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

export default function RadarPage() {
  const { profile } = useProfile();
  const { t, lang } = useLang();

  const [items, setItems] = useState<EnrichedOpportunity[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [fDeadline, setFDeadline] = useState(false);
  const [fPaid, setFPaid] = useState(false);
  const [fMyDept, setFMyDept] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);

  // Enrich every listing: eligibility + honest odds + seniors chip.
  // Two set-based queries (outcomes-by-id, seniors-by-company) instead of a
  // per-listing N+1 — the enrichment itself is then pure/in-memory (see 1.8).
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoadError(false);
    setItems(null);
    (async () => {
      try {
        const ops = await listOpportunities();
        const snapshot = snapshotFromProfile(profile);
        const companies = Array.from(new Set(ops.map((o) => o.company)));
        const [outcomesById, seniorsByCompany] = await Promise.all([
          listOutcomesForOpportunities(ops.map((o) => o.id)),
          countSeniorsByCompany(profile.university, companies),
        ]);
        const enriched = ops.map(
          (op) =>
            ({
              op,
              status: evaluateEligibility(profile, op.eligibility_rules).status,
              seniors: seniorsByCompany[op.company] ?? 0,
              rc: realityCheck(snapshot, outcomesById[op.id] ?? []),
            }) satisfies EnrichedOpportunity
        );
        if (!cancelled) setItems(enriched);
      } catch {
        // Never hang on the loader — show an explicit error + retry instead.
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, reloadKey]);

  const visible = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items
      .filter(({ op, status }) => {
        if (daysLeft(op.deadline) < 0) return false; // closed doors are gone
        if (!showIneligible && status === "ineligible") return false;
        if (fPaid && !op.is_paid) return false;
        if (fDeadline && daysLeft(op.deadline) > 7) return false;
        if (fMyDept && profile) {
          const depts = op.eligibility_rules.allowed_departments;
          if (depts && !depts.map((d) => d.toLowerCase()).includes(profile.department.toLowerCase()))
            return false;
        }
        if (q && !`${op.company} ${op.role}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.op.deadline.localeCompare(b.op.deadline));
  }, [items, query, fDeadline, fPaid, fMyDept, showIneligible, profile]);

  /*
   * Promoted listings are pulled OUT of the ranked feed, never sorted within
   * it.
   *
   * This is the load-bearing honesty rule for paid placement: Shuru's claim is
   * that what a student sees reflects evidence about their chances. Letting
   * money move a listing up the ranked list would make that claim false. A
   * separate, labelled section is an advert; a boosted rank is a lie.
   *
   * Promoted listings still pass every filter above — paying does not exempt a
   * listing from eligibility, deadline or search filtering.
   */
  const isPromoted = (op: Opportunity) =>
    Boolean(op.featured_until && new Date(op.featured_until) > new Date());

  const promoted = useMemo(() => visible.filter((i) => isPromoted(i.op)), [visible]);
  const feed = useMemo(() => visible.filter((i) => !isPromoted(i.op)), [visible]);

  const openDoors = useMemo(
    () =>
      (items ?? []).filter(
        ({ op, status }) => daysLeft(op.deadline) >= 0 && status !== "ineligible"
      ).length,
    [items]
  );

  const hour = new Date().getHours();
  const greetKey =
    hour < 12 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
  const firstName = profile?.name.split(" ")[0] ?? "";

  return (
    <>
      <SunriseHero
        greeting={`${t(greetKey)}, ${firstName}.`}
        line2={
          items
            ? lang === "bn"
              ? `${openDoors} ${t(openDoors === 1 ? "greeting.doors.one" : "greeting.doors.many")}`
              : `${openDoors} ${t(openDoors === 1 ? "greeting.doors.one" : "greeting.doors.many")}.`
            : undefined
        }
      />

      <main className="px-4 pt-4">
        {/* one-time first-run orientation */}
        <RadarIntro />

        {/* search */}
        <PixelSearch
          value={query}
          onChange={setQuery}
          placeholder={t("common.search")}
          ariaLabel={t("common.search")}
          clearLabel={t("common.clear")}
        />

        {/*
          The Resume Forge and Ask-your-agent promo blocks used to sit here,
          between the search field and the filters, pushing the actual feed
          below the fold on a 390px screen. Both are now permanent chrome —
          Forge is a nav destination, the agent is the corner dock — so the
          radar shows the radar.
        */}

        {/* filter chips */}
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <PixelChip selected={fDeadline} onClick={() => setFDeadline((v) => !v)} icon="clock">
            {t("filter.deadline")}
          </PixelChip>
          <PixelChip selected={fPaid} onClick={() => setFPaid((v) => !v)}>
            {t("filter.paid")}
          </PixelChip>
          <PixelChip selected={fMyDept} onClick={() => setFMyDept((v) => !v)}>
            {t("filter.mydept")}
          </PixelChip>
          <PixelChip selected={showIneligible} onClick={() => setShowIneligible((v) => !v)} icon="warn">
            {t("filter.showineligible")}
          </PixelChip>
        </div>

        {/* promoted — its own labelled section, above and separate from the
            ranked feed. See the note on `promoted` above for why. */}
        {promoted.length > 0 && (
          <section aria-labelledby="promoted-heading" className="mt-4">
            <h2
              id="promoted-heading"
              className="font-mono text-[10px] font-bold text-ink/70"
            >
              {t("pay.promoted")}
            </h2>
            <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-ink/60">
              {t("pay.whatIsPromotion")}
            </p>
            <div className="mt-2 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {promoted.map((item) => (
                <OpportunityCard key={item.op.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* feed — single column on mobile, two on desktop where the width
            would otherwise stretch each card into an unreadable line */}
        <div className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {loadError ? (
            <EmptyState icon="x" title={t("error.title")}>
              <p className="mb-3 font-mono text-xs text-ink/70">{t("error.body")}</p>
              <PixelButton variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                {t("error.retry")}
              </PixelButton>
            </EmptyState>
          ) : items === null ? (
            <>
              <LoadingBlock />
              <LoadingBlock />
            </>
          ) : visible.length === 0 ? (
            <EmptyState icon="radar" title={t("radar.empty")} />
          ) : (
            feed.map((item, i) => (
              <div
                key={item.op.id}
                className="card-in"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <OpportunityCard item={item} />
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}
