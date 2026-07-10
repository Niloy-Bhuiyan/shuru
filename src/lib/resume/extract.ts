/**
 * DASHBOARD SYNC — extract structured profile fields from a saved resume so
 * the user can (EXPLICITLY, never silently) update the profile that feeds
 * Reality Check's bucketing. A better resume literally improves the inputs
 * to their own odds calculation.
 */

import type { Profile, ResumeContent } from "@/lib/types";

export type ProfileHints = {
  /** skills on the resume that the profile doesn't have yet */
  newSkills: string[];
  /** true only when deployment evidence found AND profile says false */
  deployedDetected: boolean;
  /** CGPA found in resume text, when it differs from the profile */
  cgpa: number | null;
  /** department code found, when it differs from the profile */
  department: string | null;
};

const DEPLOY_RE =
  /\b(deployed|deployment|live (on|at)|hosted|in production|vercel|netlify|render\.com|railway\.app|fly\.io|heroku)\b/i;
const CGPA_RE = /\bC?GPA[:\s]*([0-4](?:\.\d{1,2})?)\s*(?:\/\s*4(?:\.0{1,2})?)?/i;
const DEPT_RE = /\b(CSE|SWE|EEE|BBA|IT)\b/;

function fullText(r: ResumeContent): string {
  return [
    r.summary,
    ...r.education.flatMap((e) => [e.institution, e.degree, e.notes]),
    ...r.experience.flatMap((e) => [e.company, e.role, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, p.tech, p.link, ...p.bullets]),
    ...r.skills,
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractProfileHints(
  r: ResumeContent,
  profile: Pick<Profile, "skills" | "has_deployed_project" | "cgpa" | "department">
): ProfileHints {
  const text = fullText(r);

  // skills: resume skill entries (plus project tech) not already in profile
  const existing = new Set(profile.skills.map((s) => s.toLowerCase().trim()));
  const candidates = [
    ...r.skills,
    ...r.projects.flatMap((p) => p.tech.split(",").map((t) => t.trim())),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 30);
  const newSkills = Array.from(
    new Map(
      candidates
        .filter((s) => !existing.has(s.toLowerCase()))
        .map((s) => [s.toLowerCase(), s])
    ).values()
  ).slice(0, 12);

  // deployed project detection (only ever flips false → true)
  const deployedDetected = !profile.has_deployed_project && DEPLOY_RE.test(text);

  // CGPA (only when parseable and different)
  let cgpa: number | null = null;
  const m = text.match(CGPA_RE);
  if (m) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v) && v >= 0 && v <= 4 && Math.abs(v - profile.cgpa) >= 0.005) {
      cgpa = v;
    }
  }

  // department (only when different)
  let department: string | null = null;
  const d = text.match(DEPT_RE);
  if (d && d[1].toUpperCase() !== profile.department.toUpperCase()) {
    department = d[1].toUpperCase();
  }

  return { newSkills, deployedDetected, cgpa, department };
}

export function hasHints(h: ProfileHints): boolean {
  return (
    h.newSkills.length > 0 || h.deployedDetected || h.cgpa !== null || h.department !== null
  );
}
