/**
 * MATCH ENGINE — how well one listing fits one profile.
 * Pure functions, no I/O. Unit-tested in __tests__/matching.test.ts.
 *
 * The honesty rule that shapes this module: most ingested listings do NOT
 * state required skills, a work mode, or eligibility rules. Scoring those as
 * a zero would rank every scraped row below every hand-written one, which is
 * a statement about the *board's* metadata, not about the student's fit.
 *
 * So each component returns `null` when the listing says nothing to judge,
 * the score is the weighted average over the components that COULD be judged,
 * and `coverage` reports how much of the weight that was. Below
 * MIN_COVERAGE the engine abstains and returns `score: null` — the same
 * stance Reality Check takes with a thin outcome sample.
 */

import { evaluateEligibility } from "@/lib/eligibility";
import type { Opportunity, Profile, WorkMode } from "@/lib/types";

export type MatchComponentId = "skills" | "eligibility" | "location" | "work_mode";

export type MatchComponent = {
  id: MatchComponentId;
  label: string;
  /** 0–1, or null when the listing states nothing to judge against. */
  score: number | null;
  weight: number;
  /** One sentence, safe to render directly. */
  detail: string;
};

export type MatchResult = {
  /** 0–100, or null when too little was judgeable. */
  score: number | null;
  components: MatchComponent[];
  /** Fraction of total weight that could be judged, 0–1. */
  coverage: number;
  reason: string;
};

const WEIGHTS: Record<MatchComponentId, number> = {
  skills: 0.5,
  eligibility: 0.3,
  location: 0.1,
  work_mode: 0.1,
};

/** Below this share of judgeable weight, a number would be noise. */
export const MIN_COVERAGE = 0.4;

/** Lowercase + trim so "React " and "react" are the same skill. */
function normalise(values: readonly string[] | undefined): string[] {
  return (values ?? [])
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

/**
 * Skill overlap as a share of what the listing ASKED for — not of what the
 * student knows. A student with 40 skills who covers 3 of 3 requirements is a
 * full match; dividing by their skill count would punish breadth.
 */
function scoreSkills(profile: Profile, op: Opportunity): MatchComponent {
  const required = normalise(op.skills_required);
  const held = new Set(normalise(profile.skills));

  if (required.length === 0) {
    return {
      id: "skills",
      label: "Skills",
      score: null,
      weight: WEIGHTS.skills,
      detail: "This listing does not state required skills.",
    };
  }

  const matched = required.filter((r) => held.has(r));
  return {
    id: "skills",
    label: "Skills",
    score: matched.length / required.length,
    weight: WEIGHTS.skills,
    detail:
      matched.length === required.length
        ? `You list all ${required.length} required skill(s).`
        : `You list ${matched.length} of ${required.length} required skill(s).`,
  };
}

/**
 * Eligibility is graded, not binary: 'borderline' is deliberately worth more
 * than zero because the decoder defines it as a near miss worth applying for.
 */
function scoreEligibility(profile: Profile, op: Opportunity): MatchComponent {
  const rules = op.eligibility_rules;
  const stated =
    rules &&
    (rules.min_cgpa != null ||
      rules.min_semester != null ||
      (rules.allowed_departments?.length ?? 0) > 0);

  if (!stated) {
    return {
      id: "eligibility",
      label: "Eligibility",
      score: null,
      weight: WEIGHTS.eligibility,
      detail: "This listing states no eligibility rules.",
    };
  }

  const { status } = evaluateEligibility(profile, rules);
  const score = status === "qualify" ? 1 : status === "borderline" ? 0.5 : 0;
  return {
    id: "eligibility",
    label: "Eligibility",
    score,
    weight: WEIGHTS.eligibility,
    detail:
      status === "qualify"
        ? "You meet the stated requirements."
        : status === "borderline"
          ? "You just miss a requirement — still worth applying."
          : "You do not meet a hard requirement.",
  };
}

function scoreLocation(profile: Profile, op: Opportunity): MatchComponent {
  const preferred = normalise(profile.preferred_locations);
  const location = op.location?.trim().toLowerCase() ?? "";

  if (preferred.length === 0 || !location) {
    return {
      id: "location",
      label: "Location",
      score: null,
      weight: WEIGHTS.location,
      detail: preferred.length === 0
        ? "You have not set preferred locations."
        : "This listing does not state a location.",
    };
  }

  // substring both ways: "Dhaka" should match "Dhaka, Bangladesh"
  const hit = preferred.some(
    (p) => location.includes(p) || p.includes(location)
  );
  return {
    id: "location",
    label: "Location",
    score: hit ? 1 : 0,
    weight: WEIGHTS.location,
    detail: hit
      ? `${op.location} is on your preferred list.`
      : `${op.location} is not on your preferred list.`,
  };
}

function scoreWorkMode(profile: Profile, op: Opportunity): MatchComponent {
  const preferred = (profile.preferred_work_modes ?? []) as WorkMode[];
  const mode = op.work_mode;

  if (preferred.length === 0 || !mode) {
    return {
      id: "work_mode",
      label: "Work mode",
      score: null,
      weight: WEIGHTS.work_mode,
      detail: preferred.length === 0
        ? "You have not set a preferred work mode."
        : "This listing does not state a work mode.",
    };
  }

  const hit = preferred.includes(mode);
  return {
    id: "work_mode",
    label: "Work mode",
    score: hit ? 1 : 0,
    weight: WEIGHTS.work_mode,
    detail: hit ? `${mode} suits you.` : `${mode} is not your preference.`,
  };
}

/**
 * Match one listing against one profile.
 *
 * A hard-ineligible candidate is forced to 0 rather than averaged: a perfect
 * skill overlap must not present a listing the student cannot apply for as a
 * strong match.
 */
export function matchScore(profile: Profile, op: Opportunity): MatchResult {
  const components = [
    scoreSkills(profile, op),
    scoreEligibility(profile, op),
    scoreLocation(profile, op),
    scoreWorkMode(profile, op),
  ];

  const judged = components.filter((c) => c.score !== null);
  const totalWeight = components.reduce((n, c) => n + c.weight, 0);
  const judgedWeight = judged.reduce((n, c) => n + c.weight, 0);
  const coverage = totalWeight === 0 ? 0 : judgedWeight / totalWeight;

  const eligibility = components.find((c) => c.id === "eligibility");
  if (eligibility?.score === 0) {
    return {
      score: 0,
      components,
      coverage,
      reason: "You do not meet a hard requirement for this listing.",
    };
  }

  if (coverage < MIN_COVERAGE) {
    return {
      score: null,
      components,
      coverage,
      reason:
        "Not enough stated detail on this listing to score a match honestly.",
    };
  }

  const weighted = judged.reduce((n, c) => n + (c.score as number) * c.weight, 0);
  const score = Math.round((weighted / judgedWeight) * 100);

  return {
    score,
    components,
    coverage,
    reason:
      coverage < 1
        ? `Scored on the ${judged.length} of 4 factors this listing states.`
        : "Scored on all four factors.",
  };
}

/**
 * Rank listings for a profile, best first.
 *
 * Abstentions sort last: a listing the engine could not judge is not evidence
 * of a poor match, but it should not outrank one that scored well either.
 */
export function rankOpportunities(
  profile: Profile,
  opportunities: readonly Opportunity[]
): { opportunity: Opportunity; match: MatchResult }[] {
  return opportunities
    .map((opportunity) => ({ opportunity, match: matchScore(profile, opportunity) }))
    .sort((a, b) => {
      if (a.match.score === null && b.match.score === null) return 0;
      if (a.match.score === null) return 1;
      if (b.match.score === null) return -1;
      return b.match.score - a.match.score;
    });
}

/**
 * Whether a listing clears the user's notification floor
 * (`notification_preferences.min_match_score`).
 *
 * An abstention never triggers an alert: the engine could not establish that
 * the listing is a good match, and "we aren't sure" is not a reason to
 * interrupt someone.
 */
export function meetsAlertThreshold(
  match: MatchResult,
  minMatchScore: number
): boolean {
  return match.score !== null && match.score >= minMatchScore;
}
