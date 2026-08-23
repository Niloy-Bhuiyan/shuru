"use client";

/**
 * Match score for one listing, with its working shown.
 *
 * The abstention is rendered as a first-class state, not as a zero or a blank.
 * Most scraped listings state no skills and cannot be scored (ADR 0002), and a
 * student needs to know the difference between "you are a weak match" and "we
 * cannot tell" — those call for opposite actions.
 *
 * Per-factor detail strings come from the engine and are English-only for now;
 * the surrounding labels are translated.
 */

import { matchScore, type MatchComponentId } from "@/lib/matching";
import { useLang, type StringKey } from "@/lib/i18n";
import type { Opportunity, Profile } from "@/lib/types";

/**
 * The engine's own `label` and `detail` are English prose — useful in logs and
 * tests, but they must not reach the UI, or a Bangla reader gets an English
 * breakdown. Everything rendered below is keyed off machine-readable fields
 * instead.
 */
const FACTOR_KEY: Record<MatchComponentId, StringKey> = {
  skills: "match.factor.skills",
  eligibility: "match.factor.eligibility",
  location: "match.factor.location",
  work_mode: "match.factor.work_mode",
};

/** Derived from the score, so no engine change is needed to translate it. */
function stateKey(score: number): StringKey {
  if (score >= 1) return "match.state.met";
  if (score <= 0) return "match.state.notMet";
  return "match.state.partial";
}

export function MatchBreakdown({
  profile,
  opportunity,
}: {
  profile: Profile;
  opportunity: Opportunity;
}) {
  const { t } = useLang();
  const result = matchScore(profile, opportunity);

  const blocked = result.score === 0 && result.reason.includes("hard requirement");
  const judged = result.components.filter((c) => c.score !== null).length;

  return (
    <section className="mt-4 border-3 border-ink bg-paper p-3 shadow-pixel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
          {t("match.title")}
        </h2>
        <span className="font-pixel text-sm text-ink">
          {result.score === null ? "—" : `${result.score}%`}
        </span>
      </div>

      {result.score === null ? (
        <div className="mt-2 border-2 border-ink bg-cream p-2">
          <p className="font-mono text-[11px] font-bold uppercase text-ink">
            {t("match.abstain")}
          </p>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey">
            {t("match.abstainHint")}
          </p>
        </div>
      ) : (
        <>
          {blocked && (
            <p className="mt-2 border-2 border-ink bg-alert p-1.5 font-mono text-[10px] font-bold uppercase text-cream">
              {t("match.blocked")}
            </p>
          )}

          {/* progress rail */}
          <div
            className="mt-2 h-2.5 w-full border-2 border-ink bg-cream"
            role="img"
            aria-label={`${result.score}%`}
          >
            <div
              className={`h-full ${result.score >= 70 ? "bg-mint" : result.score >= 40 ? "bg-amber" : "bg-grey"}`}
              style={{ width: `${result.score}%` }}
            />
          </div>

          <ul className="mt-2.5 space-y-1">
            {result.components.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <span className="font-mono text-[11px] text-ink">
                  {t(FACTOR_KEY[c.id])}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-grey">
                  {c.score === null
                    ? t("match.notStated")
                    : `${t(stateKey(c.score))} · ${Math.round(c.score * 100)}%`}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2 font-mono text-[10px] leading-relaxed text-grey">
            {t("match.scoredOn")}: {judged}/{result.components.length}
          </p>
        </>
      )}
    </section>
  );
}

export default MatchBreakdown;
