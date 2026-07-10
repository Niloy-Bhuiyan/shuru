/**
 * INGEST REFRESH — one refresh run, end to end minus persistence:
 * fetch both public APIs (independently — one failing never kills the
 * other), normalize (src/lib/ingest/normalize), split into id-refreshes
 * (same deterministic id already stored → row gets updated) vs fresh
 * candidates (fuzzy-deduped against everything known), and report honest
 * counts. Persistence is the route's job (Supabase upsert / demo passthrough).
 *
 * Free-tier discipline:
 *  - 8s timeout per source, AbortController
 *  - in-memory cooldown: one REAL run per 15 min per server instance;
 *    a run where BOTH sources fail does not burn the cooldown
 */

import type { Opportunity } from "@/lib/types";
import { normalizeArbeitnow, normalizeRemoteOk } from "./normalize";
import { dedupe } from "./dedupe";

export const REMOTEOK_URL = "https://remoteok.com/api";
export const ARBEITNOW_URL = "https://arbeitnow.com/api/job-board-api";
const FETCH_TIMEOUT_MS = 8000;
export const COOLDOWN_MS = 15 * 60 * 1000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type IngestResult = {
  /** rows fetched per source BEFORE filtering; null = source failed */
  fetched: { remoteok: number | null; arbeitnow: number | null };
  /** rows that survived filtering/normalization across both sources */
  normalized: number;
  /** rows to persist: fresh listings + refreshes of already-stored ids */
  accepted: Opportunity[];
  /** of accepted, how many are updates to rows we already had */
  refreshed: number;
  /** normalized rows dropped as duplicates (id within batch, or fuzzy) */
  skipped: number;
};

// ── cooldown (module memory; serverless cold start resets it — fine) ──
let lastSuccessfulRun = 0;

export function cooldownRemainingMs(now = Date.now()): number {
  return Math.max(0, lastSuccessfulRun + COOLDOWN_MS - now);
}

export function markSuccessfulRun(now = Date.now()) {
  lastSuccessfulRun = now;
}

/** test hook */
export function _resetIngestState() {
  lastSuccessfulRun = 0;
}

async function fetchJson(
  url: string,
  fetchImpl: FetchLike
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: {
        // RemoteOK's API terms ask consumers to identify themselves
        "User-Agent": "Shuru internship radar (student project; contact via repo)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runIngest(
  existing: Opportunity[],
  fetchImpl: FetchLike = fetch
): Promise<IngestResult> {
  const [rawRemote, rawArbeit] = await Promise.all([
    fetchJson(REMOTEOK_URL, fetchImpl),
    fetchJson(ARBEITNOW_URL, fetchImpl),
  ]);

  const fetched = {
    remoteok: Array.isArray(rawRemote) ? rawRemote.length : null,
    arbeitnow: Array.isArray((rawArbeit as { data?: unknown })?.data)
      ? ((rawArbeit as { data: unknown[] }).data).length
      : null,
  };

  const incoming = [
    ...(rawRemote !== null ? normalizeRemoteOk(rawRemote) : []),
    ...(rawArbeit !== null ? normalizeArbeitnow(rawArbeit) : []),
  ];

  // split: same deterministic id already stored → refresh; else candidate
  const existingIds = new Set(existing.map((o) => o.id));
  const seen = new Set<string>();
  const refreshes: Opportunity[] = [];
  const candidates: Opportunity[] = [];
  for (const o of incoming) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (existingIds.has(o.id)) refreshes.push(o);
    else candidates.push(o);
  }

  // fresh rows must clear the fuzzy net against everything known
  const fresh = dedupe(candidates, existing);

  return {
    fetched,
    normalized: incoming.length,
    accepted: [...refreshes, ...fresh],
    refreshed: refreshes.length,
    skipped: incoming.length - refreshes.length - fresh.length,
  };
}
