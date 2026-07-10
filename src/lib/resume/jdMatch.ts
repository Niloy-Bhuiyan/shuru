/**
 * JD-TAILOR — plain keyword-overlap between a pasted job description and
 * the resume. Pure logic, no LLM, instant and free.
 */

import type { ResumeContent } from "@/lib/types";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "will", "have",
  "has", "that", "this", "from", "who", "what", "were", "was", "can", "into",
  "able", "team", "work", "working", "role", "job", "must", "should", "may",
  "not", "all", "any", "per", "etc", "using", "use", "used", "well", "good",
  "strong", "plus", "years", "year", "experience", "knowledge", "skills",
  "skill", "ability", "candidate", "candidates", "required", "requirements",
  "requirement", "preferred", "responsibilities", "responsibility", "about",
  "other", "such", "including", "include", "includes", "their", "them",
  "they", "these", "those", "than", "more", "most", "least", "very", "also",
  "both", "each", "its", "his", "her", "him", "she", "hers", "out", "over",
  "under", "between", "within", "across", "when", "where", "how", "why",
  "degree", "bachelor", "bachelors", "master", "masters", "university",
  "looking", "seeking", "join", "opportunity", "internship", "intern",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, "").trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function resumeText(r: ResumeContent): string {
  return [
    r.summary,
    ...r.education.flatMap((e) => [e.institution, e.degree, e.notes]),
    ...r.experience.flatMap((e) => [e.company, e.role, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, p.tech, ...p.bullets]),
    ...r.skills,
  ]
    .filter(Boolean)
    .join(" ");
}

export type JdMatchResult = {
  /** 0–100 */
  percent: number;
  matched: string[];
  missing: string[];
  totalKeywords: number;
};

const MAX_KEYWORDS = 40;
const MAX_MISSING_SHOWN = 15;

export function jdMatch(r: ResumeContent, jd: string): JdMatchResult | null {
  const jdTokens = tokenize(jd);
  if (jdTokens.length === 0) return null;

  // rank JD keywords by frequency, keep the top MAX_KEYWORDS distinct
  const freq = new Map<string, number>();
  for (const tok of jdTokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  const keywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORDS)
    .map(([k]) => k);

  const resumeTokens = new Set(tokenize(resumeText(r)));
  const matched = keywords.filter((k) => resumeTokens.has(k));
  const missing = keywords.filter((k) => !resumeTokens.has(k));

  return {
    percent: Math.round((matched.length / keywords.length) * 100),
    matched,
    missing: missing.slice(0, MAX_MISSING_SHOWN),
    totalKeywords: keywords.length,
  };
}
