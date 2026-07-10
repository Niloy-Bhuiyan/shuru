/**
 * REALITY CHECK — calibrated shortlist odds from real past outcomes.
 * Pure functions, no I/O. Unit-tested in __tests__/realityCheck.test.ts.
 *
 * The contract (non-negotiable, from the spec):
 *   - shortlist_odds = successes / total among SIMILAR past applicants
 *     (success = 'shortlisted' OR 'offer')
 *   - Confidence from sample size n: HIGH n≥20 · MED 8≤n<20 · ABSTAIN n<8
 *   - When abstaining, NEVER fabricate a number. Honesty over completeness.
 */

import type { Outcome, ProfileSnapshot } from "@/lib/types";

// ── buckets ─────────────────────────────────────────────────────
export type CgpaBand = "lt3" | "3to349" | "3p5plus";

export function cgpaBand(cgpa: number): CgpaBand {
  if (cgpa >= 3.5) return "3p5plus";
  if (cgpa >= 3.0) return "3to349";
  return "lt3";
}

export const CGPA_BAND_LABEL: Record<CgpaBand, string> = {
  lt3: "CGPA below 3.00",
  "3to349": "CGPA 3.00–3.49",
  "3p5plus": "CGPA 3.50+",
};

// ── features (drive "THE ONE THING" / "ALREADY IN YOUR FAVOUR") ─
export type FeatureId =
  | "has_deployed_project"
  | "cgpa_3p5"
  | "has_projects"
  | "senior_semester";

export const FEATURES: { id: FeatureId; label: string; fixHint: string }[] = [
  {
    id: "has_deployed_project",
    label: "A deployed, live project",
    fixHint: "Ship one project to a public URL before applying.",
  },
  {
    id: "cgpa_3p5",
    label: "CGPA 3.50 or higher",
    fixHint: "Your CGPA band is below 3.50 — lean on projects to compensate.",
  },
  {
    id: "has_projects",
    label: "A project portfolio",
    fixHint: "Add 2–3 finished projects to your GitHub and CV.",
  },
  {
    id: "senior_semester",
    label: "Semester 8 or later",
    fixHint: "Most shortlisted applicants were in semester 8+.",
  },
];

export function featureValue(s: ProfileSnapshot, id: FeatureId): boolean {
  switch (id) {
    case "has_deployed_project":
      return s.has_deployed_project;
    case "cgpa_3p5":
      return s.cgpa >= 3.5;
    case "has_projects":
      return s.has_projects;
    case "senior_semester":
      return s.year >= 8;
  }
}

// ── result types ────────────────────────────────────────────────
export type FeatureGap = {
  id: FeatureId;
  label: string;
  fixHint: string;
  /** success rate WITH the feature minus WITHOUT, in the cohort (0–1) */
  gap: number;
  rateWith: number;
  rateWithout: number;
};

export type RealityCheckResult =
  | {
      kind: "odds";
      /** 0–100 */
      percent: number;
      confidence: "HIGH" | "MED";
      n: number;
      /** which cohort produced the number */
      cohort: "band+dept" | "band";
      oneThing: FeatureGap | null;
      inYourFavour: FeatureGap | null;
    }
  | {
      kind: "abstain";
      n: number;
      needed: number;
    };

const MIN_N = 8;
const HIGH_N = 20;
const MIN_GAP = 0.05; // gaps below 5 points are noise, don't headline them

function isSuccess(o: Outcome): boolean {
  return o.result === "shortlisted" || o.result === "offer";
}

// ── main entry ──────────────────────────────────────────────────
export function realityCheck(
  me: ProfileSnapshot,
  outcomes: Outcome[]
): RealityCheckResult {
  const myBand = cgpaBand(me.cgpa);

  // Primary cohort: same CGPA band + same department.
  const bandDept = outcomes.filter(
    (o) =>
      cgpaBand(o.profile_snapshot.cgpa) === myBand &&
      o.profile_snapshot.dept.toLowerCase() === me.dept.toLowerCase()
  );

  // Single relaxation step: same CGPA band, any department.
  const bandOnly = outcomes.filter(
    (o) => cgpaBand(o.profile_snapshot.cgpa) === myBand
  );

  let cohort: Outcome[];
  let cohortKind: "band+dept" | "band";
  if (bandDept.length >= MIN_N) {
    cohort = bandDept;
    cohortKind = "band+dept";
  } else if (bandOnly.length >= MIN_N) {
    cohort = bandOnly;
    cohortKind = "band";
  } else {
    // NOT ENOUGH SIGNAL. We abstain — we never invent a number.
    return {
      kind: "abstain",
      n: Math.max(bandDept.length, bandOnly.length),
      needed: MIN_N,
    };
  }

  const n = cohort.length;
  const successes = cohort.filter(isSuccess).length;
  const percent = Math.round((successes / n) * 100);
  const confidence = n >= HIGH_N ? "HIGH" : "MED";

  // Feature gaps inside the cohort.
  const gaps: FeatureGap[] = [];
  for (const f of FEATURES) {
    const withF = cohort.filter((o) => featureValue(o.profile_snapshot, f.id));
    const withoutF = cohort.filter(
      (o) => !featureValue(o.profile_snapshot, f.id)
    );
    if (withF.length === 0 || withoutF.length === 0) continue;
    const rateWith = withF.filter(isSuccess).length / withF.length;
    const rateWithout = withoutF.filter(isSuccess).length / withoutF.length;
    gaps.push({
      id: f.id,
      label: f.label,
      fixHint: f.fixHint,
      gap: rateWith - rateWithout,
      rateWith,
      rateWithout,
    });
  }

  const meaningful = gaps.filter((g) => g.gap >= MIN_GAP);

  // THE ONE THING: biggest gap among features I'm MISSING.
  const oneThing =
    meaningful
      .filter((g) => !featureValue(me, g.id))
      .sort((a, b) => b.gap - a.gap)[0] ?? null;

  // ALREADY IN YOUR FAVOUR: biggest gap among features I HAVE.
  const inYourFavour =
    meaningful
      .filter((g) => featureValue(me, g.id))
      .sort((a, b) => b.gap - a.gap)[0] ?? null;

  return {
    kind: "odds",
    percent,
    confidence,
    n,
    cohort: cohortKind,
    oneThing,
    inYourFavour,
  };
}

/** Profile → snapshot shape used for similarity matching.
 *  has_projects ≈ has skills listed or has anything deployed. */
export function snapshotFromProfile(p: {
  cgpa: number;
  department: string;
  year: number;
  has_deployed_project: boolean;
  skills?: string[];
}): ProfileSnapshot {
  return {
    cgpa: p.cgpa,
    dept: p.department,
    year: p.year,
    has_projects: p.has_deployed_project || (p.skills?.length ?? 0) >= 2,
    has_deployed_project: p.has_deployed_project,
  };
}
