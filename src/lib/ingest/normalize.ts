/**
 * INGEST NORMALIZATION — pure functions turning RemoteOK / Arbeitnow raw
 * API JSON into Opportunity rows. No network in this file.
 *
 * Approved calls encoded here:
 *  - deadline = posted_date + 30 days (neither API provides one);
 *    cycle_label says "Rolling · via <source>" so the UI never implies a
 *    real deadline.
 *  - is_paid = true ONLY on salary evidence; otherwise false with
 *    "Compensation not stated by source" in eligibility_rules.other_text.
 *  - eligibility_rules gates stay null → Reality Check abstains by
 *    construction (zero outcomes, no fake odds).
 *  - is_verified = false for every ingested row (curated BD rows keep true).
 *  - Deterministic IDs derived from `source:source_id`, so a re-run
 *    produces the SAME ids (refresh upserts instead of duplicating).
 */

import type { Opportunity } from "@/lib/types";

export const MAX_PER_SOURCE = 25;
const DEADLINE_DAYS = 30;

// ── filtering vocabulary ──
const INTERN_TERMS = [
  "intern",
  "internship",
  "entry level",
  "entry-level",
  "junior",
  "graduate",
  "trainee",
  "working student",
  "new grad",
];
const TECH_TERMS = [
  "software",
  "developer",
  "engineer",
  "engineering",
  "data",
  "machine learning",
  "ml",
  "ai",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "full stack",
  "fullstack",
  "full-stack",
  "devops",
  "cloud",
  "security",
  "qa",
  "android",
  "ios",
  "mobile",
  "web",
  "python",
  "javascript",
  "typescript",
  "java",
  "react",
  "node",
  "golang",
  "rust",
  "sql",
];
const EXCLUDE_TERMS = [
  "senior",
  "sr.",
  "staff",
  "lead",
  "principal",
  "manager",
  "head of",
  "director",
  "vp ",
  "chief",
];

/** title+tags must hit an intern-family term AND a tech term, and none of
 *  the seniority excludes. Exported for tests. */
export function matchesFilters(title: string, tags: string[]): boolean {
  const hay = `${title} ${tags.join(" ")}`.toLowerCase();
  if (EXCLUDE_TERMS.some((t) => hay.includes(t))) return false;
  return INTERN_TERMS.some((t) => hay.includes(t)) && TECH_TERMS.some((t) => hay.includes(t));
}

// ── deterministic id: FNV-1a over the key, expanded to a UUID shape ──
function fnv1a(str: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Same input → same UUID, always version/variant-valid. Exported for tests. */
export function deterministicId(source: string, sourceId: string): string {
  const key = `${source}:${sourceId}`;
  const hex = [0, 1, 2, 3]
    .map((i) => fnv1a(key, i * 7919).toString(16).padStart(8, "0"))
    .join(""); // 32 hex chars
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-4" +
    hex.slice(13, 16) +
    "-8" +
    hex.slice(17, 20) +
    "-" +
    hex.slice(20, 32)
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const NOT_STATED = "Compensation not stated by source.";

function baseRow(args: {
  source: "remoteok" | "arbeitnow";
  sourceId: string;
  company: string;
  role: string;
  location: string;
  postedIso: string;
  paidEvidence: boolean;
  url: string | null;
}): Opportunity | null {
  const deadline = addDays(args.postedIso, DEADLINE_DAYS);
  if (!deadline || !args.company.trim() || !args.role.trim()) return null;
  const sourceLabel = args.source === "remoteok" ? "RemoteOK" : "Arbeitnow";
  return {
    id: deterministicId(args.source, args.sourceId),
    company: args.company.trim(),
    role: args.role.trim(),
    location: args.location.trim() || "Remote",
    duration: "Not specified",
    is_paid: args.paidEvidence,
    deadline,
    eligibility_rules: {
      min_cgpa: null,
      min_semester: null,
      allowed_departments: null,
      other_text: args.paidEvidence
        ? `Remote listing via ${sourceLabel}. Requirements not structured — read the posting.`
        : `Remote listing via ${sourceLabel}. ${NOT_STATED} Requirements not structured — read the posting.`,
    },
    source_url: args.url,
    is_verified: false,
    cycle_label: `Rolling · via ${sourceLabel}`,
  };
}

// ── RemoteOK: https://remoteok.com/api ──
// Array whose FIRST element is a legal notice object; jobs follow with
// { id|slug, position, company, location, tags[], date, salary_min,
//   salary_max, url, ... }
type RemoteOkJob = {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: unknown;
  date?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
};

export function normalizeRemoteOk(raw: unknown, cap = MAX_PER_SOURCE): Opportunity[] {
  if (!Array.isArray(raw)) return [];
  const out: Opportunity[] = [];
  for (const item of raw) {
    if (out.length >= cap) break;
    const j = item as RemoteOkJob;
    // the legal-notice element (and anything malformed) has no position/company
    if (!j || typeof j.position !== "string" || typeof j.company !== "string") continue;
    const tags = Array.isArray(j.tags) ? j.tags.map(String) : [];
    if (!matchesFilters(j.position, tags)) continue;
    const row = baseRow({
      source: "remoteok",
      sourceId: String(j.id ?? j.slug ?? `${j.company}-${j.position}`),
      company: j.company,
      role: j.position,
      location: typeof j.location === "string" && j.location ? j.location : "Remote",
      postedIso: typeof j.date === "string" ? j.date : "",
      paidEvidence: Boolean(j.salary_min || j.salary_max),
      url: typeof j.url === "string" ? j.url : null,
    });
    if (row) out.push(row);
  }
  return out;
}

// ── Arbeitnow: https://arbeitnow.com/api/job-board-api ──
// { data: [{ slug, company_name, title, remote, url, tags[], job_types[],
//            location, created_at (unix SECONDS) }], links, meta }
type ArbeitnowJob = {
  slug?: string;
  company_name?: string;
  title?: string;
  remote?: boolean;
  url?: string;
  tags?: unknown;
  job_types?: unknown;
  location?: string;
  created_at?: number;
};

export function normalizeArbeitnow(raw: unknown, cap = MAX_PER_SOURCE): Opportunity[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: Opportunity[] = [];
  for (const item of data) {
    if (out.length >= cap) break;
    const j = item as ArbeitnowJob;
    if (!j || typeof j.title !== "string" || typeof j.company_name !== "string") continue;
    const tags = [
      ...(Array.isArray(j.tags) ? j.tags.map(String) : []),
      ...(Array.isArray(j.job_types) ? j.job_types.map(String) : []),
    ];
    if (!matchesFilters(j.title, tags)) continue;
    const postedIso =
      typeof j.created_at === "number" && j.created_at > 0
        ? new Date(j.created_at * 1000).toISOString()
        : "";
    const location =
      typeof j.location === "string" && j.location
        ? j.remote
          ? `Remote (${j.location})`
          : j.location
        : "Remote";
    const row = baseRow({
      source: "arbeitnow",
      sourceId: String(j.slug ?? `${j.company_name}-${j.title}`),
      company: j.company_name,
      role: j.title,
      location,
      postedIso,
      // Arbeitnow exposes no salary fields — per the approved call,
      // no evidence ⇒ is_paid false + "not stated" note
      paidEvidence: false,
      url: typeof j.url === "string" ? j.url : null,
    });
    if (row) out.push(row);
  }
  return out;
}
