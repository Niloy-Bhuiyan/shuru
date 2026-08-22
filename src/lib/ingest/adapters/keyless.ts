import { normalizeArbeitnow, normalizeRemoteOk } from "../normalize";
import type { Opportunity } from "@/lib/types";
import {
  enabled,
  type Adapter,
  type AdapterRunResult,
  type FetchLike,
} from "./types";

/**
 * RemoteOK and Arbeitnow — the two original keyless public feeds, moved
 * behind the adapter interface so every source runs through one pipeline.
 * Both stay on by default and are switched off by setting their env flag
 * to "false".
 */

const FETCH_TIMEOUT_MS = 8000;

export const REMOTEOK_URL = "https://remoteok.com/api";
export const ARBEITNOW_URL = "https://arbeitnow.com/api/job-board-api";

async function fetchJson(
  url: string,
  fetchImpl: FetchLike
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
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

function countRaw(raw: unknown, key?: string): number {
  if (key) {
    const arr = (raw as Record<string, unknown>)?.[key];
    return Array.isArray(arr) ? arr.length : 0;
  }
  return Array.isArray(raw) ? raw.length : 0;
}

export const remoteOkAdapter: Adapter = {
  source: "remoteok",
  isAvailable: (env) => enabled(env.INGEST_REMOTEOK_ENABLED),
  unavailableReason: () => "INGEST_REMOTEOK_ENABLED=false",
  async run(fetchImpl): Promise<AdapterRunResult> {
    const raw = await fetchJson(REMOTEOK_URL, fetchImpl);
    if (raw === null) {
      return {
        source: "remoteok",
        fetched: null,
        listings: [],
        error: "unreachable",
      };
    }
    const listings: Opportunity[] = normalizeRemoteOk(raw);
    return { source: "remoteok", fetched: countRaw(raw), listings, error: null };
  },
};

export const arbeitnowAdapter: Adapter = {
  source: "arbeitnow",
  isAvailable: (env) => enabled(env.INGEST_ARBEITNOW_ENABLED),
  unavailableReason: () => "INGEST_ARBEITNOW_ENABLED=false",
  async run(fetchImpl): Promise<AdapterRunResult> {
    const raw = await fetchJson(ARBEITNOW_URL, fetchImpl);
    if (raw === null) {
      return {
        source: "arbeitnow",
        fetched: null,
        listings: [],
        error: "unreachable",
      };
    }
    const listings: Opportunity[] = normalizeArbeitnow(raw);
    return {
      source: "arbeitnow",
      fetched: countRaw(raw, "data"),
      listings,
      error: null,
    };
  },
};
