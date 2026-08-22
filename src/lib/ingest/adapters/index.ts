import { adzunaAdapter } from "./adzuna";
import { ashbyAdapter } from "./ashby";
import { arbeitnowAdapter, remoteOkAdapter } from "./keyless";
import { leverAdapter } from "./lever";
import type { Adapter } from "./types";

export type { Adapter, AdapterRunResult, FetchLike } from "./types";

/**
 * The adapter registry. Adding a source means adding one file and one entry
 * here — nothing else in the pipeline changes.
 */
export const ADAPTERS: Adapter[] = [
  remoteOkAdapter,
  arbeitnowAdapter,
  leverAdapter,
  ashbyAdapter,
  adzunaAdapter,
];

export type AdapterAvailability = {
  source: string;
  available: boolean;
  reason: string | null;
};

/**
 * Which sources would run right now, and why the others would not.
 * Surfaced by GET /api/ingest so a misconfigured source is visible rather
 * than silently producing nothing.
 */
export function adapterAvailability(
  env: NodeJS.ProcessEnv = process.env
): AdapterAvailability[] {
  return ADAPTERS.map((a) => {
    const available = a.isAvailable(env);
    return {
      source: a.source,
      available,
      reason: available ? null : a.unavailableReason(env),
    };
  });
}

export function activeAdapters(env: NodeJS.ProcessEnv = process.env): Adapter[] {
  return ADAPTERS.filter((a) => a.isAvailable(env));
}
