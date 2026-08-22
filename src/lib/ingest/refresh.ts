/**
 * INGEST REFRESH — one refresh run, end to end minus persistence.
 *
 * Every configured adapter runs independently (one failing never kills the
 * others), output is normalized to one shape, then split into id-refreshes
 * (same deterministic id already stored → row gets updated) vs fresh
 * candidates (fuzzy-deduped against everything known). Counts are reported
 * honestly, including per-source failures. Persistence is the route's job.
 *
 * Free-tier discipline:
 *  - 8s timeout per source, AbortController (enforced inside each adapter)
 *  - in-memory cooldown: one REAL run per 15 min per server instance;
 *    a run where EVERY source fails does not burn the cooldown
 */

import type { Opportunity } from "@/lib/types";
import { dedupe } from "./dedupe";
import { activeAdapters, type FetchLike } from "./adapters";

export { REMOTEOK_URL, ARBEITNOW_URL } from "./adapters/keyless";
export const COOLDOWN_MS = 15 * 60 * 1000;

export type { FetchLike };

export type SourceReport = {
  source: string;
  /** rows the board returned before filtering; null = the source failed */
  fetched: number | null;
  kept: number;
  error: string | null;
};

export type IngestResult = {
  /**
   * Rows fetched per source BEFORE filtering; null = that source failed.
   * Keyed by source name so adding an adapter needs no change here.
   */
  fetched: Record<string, number | null>;
  /** per-source detail, including why a source produced nothing */
  sources: SourceReport[];
  /** rows that survived filtering/normalization across all sources */
  normalized: number;
  /** rows to persist: fresh listings + refreshes of already-stored ids */
  accepted: Opportunity[];
  /** of accepted, how many are updates to rows we already had */
  refreshed: number;
  /** normalized rows dropped as duplicates (id within batch, or fuzzy) */
  skipped: number;
  /** true when every configured source failed — the caller must not
   *  treat this as a successful (empty) run */
  allSourcesFailed: boolean;
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

export async function runIngest(
  existing: Opportunity[],
  fetchImpl: FetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<IngestResult> {
  const adapters = activeAdapters(env);

  // Sources are independent, so run them concurrently and let each one
  // report its own failure rather than aborting the batch.
  const results = await Promise.all(
    adapters.map(async (a) => {
      try {
        return await a.run(fetchImpl, env);
      } catch (e) {
        return {
          source: a.source,
          fetched: null,
          listings: [] as Opportunity[],
          error: (e as Error).message,
        };
      }
    })
  );

  const fetched: Record<string, number | null> = {};
  const sources: SourceReport[] = [];
  const incoming: Opportunity[] = [];
  for (const r of results) {
    fetched[r.source] = r.fetched;
    sources.push({
      source: r.source,
      fetched: r.fetched,
      kept: r.listings.length,
      error: r.error,
    });
    incoming.push(...r.listings);
  }

  const allSourcesFailed =
    results.length > 0 && results.every((r) => r.fetched === null);

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
    sources,
    normalized: incoming.length,
    accepted: [...refreshes, ...fresh],
    refreshed: refreshes.length,
    skipped: incoming.length - refreshes.length - fresh.length,
    allSourcesFailed,
  };
}
