import type { Opportunity } from "@/lib/types";
import type { IngestSource } from "../normalize";

/**
 * One adapter per external board.
 *
 * An adapter reports whether it is available rather than throwing: a source
 * with no credentials configured is inactive, not broken. A source that is
 * configured but unreachable fails its own run without affecting the others.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type AdapterRunResult = {
  source: IngestSource;
  /** rows returned by the board before filtering; null when the fetch failed */
  fetched: number | null;
  listings: Opportunity[];
  /** populated when the source was unreachable or returned an error */
  error: string | null;
};

export type Adapter = {
  source: IngestSource;
  /**
   * False when the source is switched off or missing required configuration.
   * An unavailable adapter is skipped silently — it is a deployment choice,
   * not a failure.
   */
  isAvailable(env: NodeJS.ProcessEnv): boolean;
  /** Why the adapter is inactive, for the admin-facing run report. */
  unavailableReason(env: NodeJS.ProcessEnv): string;
  run(fetchImpl: FetchLike, env: NodeJS.ProcessEnv): Promise<AdapterRunResult>;
};

/** Comma-separated env value → trimmed, non-empty items. */
export function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True unless explicitly set to "false". */
export function enabled(value: string | undefined): boolean {
  return value !== "false";
}
