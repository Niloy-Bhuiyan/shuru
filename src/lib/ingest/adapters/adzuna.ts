import { buildListing, matchesFilters, MAX_PER_SOURCE } from "../normalize";
import type { Opportunity } from "@/lib/types";
import type { Adapter, AdapterRunResult, FetchLike } from "./types";

/**
 * Adzuna — https://api.adzuna.com/v1/api/jobs/<country>/search/1
 *
 * Aggregator, free tier, requires an app id + key. Inactive unless both are
 * configured, so the adapter is opt-in rather than a hard dependency.
 */

const FETCH_TIMEOUT_MS = 8000;

export function adzunaUrl(
  country: string,
  appId: string,
  appKey: string,
  perPage: number
): string {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(perPage),
    what: "intern",
    content_type: "application/json",
  });
  return `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(
    country
  )}/search/1?${params.toString()}`;
}

type AdzunaJob = {
  id?: string;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  contract_time?: string;
};

export function normalizeAdzuna(raw: unknown, cap = MAX_PER_SOURCE): Opportunity[] {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];

  const out: Opportunity[] = [];
  for (const item of results) {
    if (out.length >= cap) break;
    const j = item as AdzunaJob;
    const company = j?.company?.display_name;
    if (!j || typeof j.title !== "string" || !company) continue;
    if (!matchesFilters(j.title, [j.description ?? "", j.contract_time ?? ""])) {
      continue;
    }

    // Adzuna predicts salaries when the posting omits them. A predicted
    // figure is Adzuna's guess, not the employer's claim, so it does not
    // count as evidence that the internship is paid.
    const predicted = j.salary_is_predicted === "1";
    const hasSalary = Boolean(j.salary_min || j.salary_max) && !predicted;

    const row = buildListing({
      source: "adzuna",
      sourceId: String(j.id ?? `${company}-${j.title}`),
      company,
      role: j.title,
      location: j.location?.display_name ?? "",
      postedIso: typeof j.created === "string" ? j.created : new Date().toISOString(),
      paidEvidence: hasSalary,
      url: j.redirect_url ?? null,
      workMode: "onsite",
      description: j.description?.slice(0, 4000) ?? null,
      stipendText: hasSalary
        ? `${j.salary_min ?? "?"}–${j.salary_max ?? "?"} per year (source figure)`
        : null,
    });
    if (row) out.push(row);
  }
  return out;
}

export const adzunaAdapter: Adapter = {
  source: "adzuna",

  isAvailable(env) {
    return Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY);
  },

  unavailableReason() {
    return "ADZUNA_APP_ID / ADZUNA_APP_KEY not set";
  },

  async run(fetchImpl, env): Promise<AdapterRunResult> {
    const country = (env.ADZUNA_COUNTRY || "gb").toLowerCase();
    const url = adzunaUrl(
      country,
      env.ADZUNA_APP_ID!,
      env.ADZUNA_APP_KEY!,
      MAX_PER_SOURCE
    );

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        return {
          source: "adzuna",
          fetched: null,
          listings: [],
          error: `HTTP ${res.status}`,
        };
      }
      const raw = await res.json();
      const results = (raw as { results?: unknown })?.results;
      return {
        source: "adzuna",
        fetched: Array.isArray(results) ? results.length : 0,
        listings: normalizeAdzuna(raw),
        error: null,
      };
    } catch (e) {
      return {
        source: "adzuna",
        fetched: null,
        listings: [],
        error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
