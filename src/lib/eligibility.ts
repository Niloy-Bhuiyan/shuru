/**
 * ELIGIBILITY DECODER — compares a profile against a listing's rules.
 * Pure functions, no I/O. Unit-tested in __tests__/eligibility.test.ts.
 *
 * Status meaning (drives badge colors):
 *   qualify    → every hard rule met (soft "other_text" rules may be unknown)
 *   borderline → misses CGPA by ≤ 0.15 or semester by ≤ 1 (worth a shot)
 *   ineligible → hard miss (wrong department, or beyond the margins)
 */

import type { EligibilityRules, Profile } from "@/lib/types";

export type CheckState = "met" | "missing" | "unknown";

export type EligibilityCheck = {
  id: "cgpa" | "semester" | "department" | "other";
  label: string;
  detail: string;
  state: CheckState;
};

export type EligibilityStatus = "qualify" | "borderline" | "ineligible";

export type EligibilityResult = {
  status: EligibilityStatus;
  checks: EligibilityCheck[];
};

const CGPA_MARGIN = 0.15;
const SEMESTER_MARGIN = 1;

type ProfileLike = Pick<Profile, "cgpa" | "department" | "year">;

export function evaluateEligibility(
  profile: ProfileLike,
  rules: EligibilityRules | null | undefined
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  let hardMiss = false;
  let borderlineMiss = false;

  const r = rules ?? {};

  if (r.min_cgpa !== null && r.min_cgpa !== undefined) {
    const met = profile.cgpa >= r.min_cgpa;
    const nearMiss = !met && r.min_cgpa - profile.cgpa <= CGPA_MARGIN;
    checks.push({
      id: "cgpa",
      label: `CGPA ≥ ${r.min_cgpa.toFixed(2)}`,
      detail: met
        ? `Yours: ${profile.cgpa.toFixed(2)} — clears it`
        : `Yours: ${profile.cgpa.toFixed(2)} — ${(r.min_cgpa - profile.cgpa).toFixed(2)} short`,
      state: met ? "met" : "missing",
    });
    if (!met) {
      if (nearMiss) borderlineMiss = true;
      else hardMiss = true;
    }
  }

  if (r.min_semester !== null && r.min_semester !== undefined) {
    const met = profile.year >= r.min_semester;
    const nearMiss = !met && r.min_semester - profile.year <= SEMESTER_MARGIN;
    checks.push({
      id: "semester",
      label: `Semester ≥ ${r.min_semester}`,
      detail: met
        ? `You are in semester ${profile.year} — clears it`
        : `You are in semester ${profile.year} — ${r.min_semester - profile.year} short`,
      state: met ? "met" : "missing",
    });
    if (!met) {
      if (nearMiss) borderlineMiss = true;
      else hardMiss = true;
    }
  }

  if (r.allowed_departments && r.allowed_departments.length > 0) {
    const met = r.allowed_departments
      .map((d) => d.toLowerCase())
      .includes(profile.department.toLowerCase());
    checks.push({
      id: "department",
      label: `Department: ${r.allowed_departments.join(" / ")}`,
      detail: met
        ? `Yours: ${profile.department} — allowed`
        : `Yours: ${profile.department} — not on the list`,
      state: met ? "met" : "missing",
    });
    // wrong department is never "borderline" — it's a hard gate
    if (!met) hardMiss = true;
  }

  if (r.other_text) {
    checks.push({
      id: "other",
      label: "Listed requirement",
      detail: `"${r.other_text}" — soft requirement, can't auto-check`,
      state: "unknown",
    });
  }

  const status: EligibilityStatus = hardMiss
    ? "ineligible"
    : borderlineMiss
      ? "borderline"
      : "qualify";

  return { status, checks };
}
