import { buildListing, matchesFilters, MAX_PER_SOURCE } from "../normalize";
import type { Opportunity, WorkMode } from "@/lib/types";
import { csv, type Adapter, type AdapterRunResult, type FetchLike } from "./types";

/**
 * Ashby — https://api.ashbyhq.com/posting-api/job-board/<name>
 *
 * Public job-board API, no key. Inactive until ASHBY_COMPANIES names at
 * least one board.
 */

const FETCH_TIMEOUT_MS = 8000;

export function ashbyUrl(name: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(name)}`;
}

type AshbyJob = {
  id?: string;
  title?: string;
  location?: string;
  employmentType?: string;
  isRemote?: boolean;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  department?: string;
  compensation?: unknown;
};

type AshbyResponse = { jobs?: unknown; name?: string };

export function normalizeAshby(
  raw: unknown,
  fallbackCompany: string,
  cap = MAX_PER_SOURCE
): Opportunity[] {
  const body = raw as AshbyResponse | undefined;
  const jobs = body?.jobs;
  if (!Array.isArray(jobs)) return [];
  const company =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : fallbackCompany;

  const out: Opportunity[] = [];
  for (const item of jobs) {
    if (out.length >= cap) break;
    const j = item as AshbyJob;
    if (!j || typeof j.title !== "string") continue;

    // Ashby marks interns through employmentType as often as through the title
    if (!matchesFilters(j.title, [j.employmentType ?? "", j.department ?? ""])) {
      continue;
    }

    const mode: WorkMode = j.isRemote ? "remote" : "onsite";
    const row = buildListing({
      source: "ashby",
      sourceId: String(j.id ?? `${company}-${j.title}`),
      company,
      role: j.title,
      location: j.location ?? "",
      postedIso:
        typeof j.publishedAt === "string" ? j.publishedAt : new Date().toISOString(),
      // compensation is an opaque structure and often absent; only claim paid
      // when the board actually carried something
      paidEvidence: Boolean(j.compensation),
      url: j.jobUrl ?? j.applyUrl ?? null,
      workMode: mode,
      description: j.descriptionPlain?.slice(0, 4000) ?? null,
    });
    if (row) out.push(row);
  }
  return out;
}

async function fetchBoard(
  name: string,
  fetchImpl: FetchLike
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(ashbyUrl(name), {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const ashbyAdapter: Adapter = {
  source: "ashby",

  isAvailable(env) {
    return csv(env.ASHBY_COMPANIES).length > 0;
  },

  unavailableReason() {
    return "ASHBY_COMPANIES is empty — no boards configured";
  },

  async run(fetchImpl, env): Promise<AdapterRunResult> {
    const names = csv(env.ASHBY_COMPANIES);
    const listings: Opportunity[] = [];
    let fetched = 0;
    const failures: string[] = [];
    const perBoard = Math.max(1, Math.floor(MAX_PER_SOURCE / names.length));

    for (const name of names) {
      const raw = await fetchBoard(name, fetchImpl);
      if (raw === null) {
        failures.push(name);
        continue;
      }
      const jobs = (raw as AshbyResponse)?.jobs;
      if (Array.isArray(jobs)) fetched += jobs.length;
      listings.push(...normalizeAshby(raw, name, perBoard));
    }

    const allFailed = failures.length === names.length;
    return {
      source: "ashby",
      fetched: allFailed ? null : fetched,
      listings,
      error: failures.length ? `unreachable boards: ${failures.join(", ")}` : null,
    };
  },
};
