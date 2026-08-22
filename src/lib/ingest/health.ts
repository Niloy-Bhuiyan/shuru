/**
 * SOURCE HEALTH
 *
 * A job board rarely dies loudly. It keeps returning 200 with a payload that
 * no longer matches what the normalizer expects, and the run log fills with
 * successes that kept nothing. `ingestion_runs` already records fetched-vs-kept
 * per run; this turns that history into a verdict.
 *
 * The distinction that matters is **reachable but contributing nothing**.
 * That is not automatically a fault: RemoteOK legitimately carries no tech
 * internships for long stretches, and reporting that as an error would train
 * whoever reads the dashboard to ignore it. So `yielding_nothing` is reported
 * as an observation to look at, and only transport-level failure is an error.
 *
 * Pure over its inputs so it can be tested without a database.
 */

import type { IngestionRun, InternshipSource } from "@/lib/types";

export type HealthStatus =
  | "healthy"
  | "yielding_nothing"
  | "degraded"
  | "failing"
  | "never_run";

export type SourceHealth = {
  source: InternshipSource;
  status: HealthStatus;
  /** How many runs this verdict considered. */
  runs: number;
  lastRunAt: string | null;
  lastError: string | null;
  totalFetched: number;
  totalKept: number;
  /** One sentence, safe to render directly. */
  detail: string;
};

/** Runs older than this tell you about a source you no longer have. */
const DEFAULT_WINDOW = 10;

/**
 * Verdict per source, newest runs first.
 *
 * `configured` is passed in so a source that is switched on but has never run
 * is reported as `never_run` rather than silently omitted — an absent row is
 * the easiest failure to miss.
 */
export function assessSourceHealth(
  runs: IngestionRun[],
  configured: readonly InternshipSource[],
  window: number = DEFAULT_WINDOW
): SourceHealth[] {
  return configured.map((source) => {
    const mine = runs
      .filter((r) => r.source === source)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, window);

    if (mine.length === 0) {
      return {
        source,
        status: "never_run",
        runs: 0,
        lastRunAt: null,
        lastError: null,
        totalFetched: 0,
        totalKept: 0,
        detail: "Configured but has never run.",
      };
    }

    const latest = mine[0];
    const totalFetched = mine.reduce((n, r) => n + r.fetched, 0);
    const totalKept = mine.reduce((n, r) => n + r.kept, 0);
    const failures = mine.filter((r) => r.status === "failed").length;

    const base = {
      source,
      runs: mine.length,
      lastRunAt: latest.started_at,
      lastError: latest.error,
      totalFetched,
      totalKept,
    };

    // Transport failure is the only unambiguous error.
    if (latest.status === "failed") {
      return {
        ...base,
        status: "failing",
        detail: `Last run failed${latest.error ? `: ${latest.error}` : "."}`,
      };
    }

    // Intermittent failure behind a currently-green run still matters.
    if (failures > 0) {
      return {
        ...base,
        status: "degraded",
        detail: `${failures} of the last ${mine.length} runs failed.`,
      };
    }

    // Reachable, returning rows, but nothing survives normalisation. Either
    // the board genuinely has no internships right now, or its payload shape
    // changed — this cannot tell them apart, so it says so.
    if (totalFetched > 0 && totalKept === 0) {
      return {
        ...base,
        status: "yielding_nothing",
        detail:
          `Fetched ${totalFetched} listing(s) across ${mine.length} run(s) and kept none. ` +
          `Either the board has no matching internships, or its payload changed.`,
      };
    }

    if (totalFetched === 0) {
      return {
        ...base,
        status: "yielding_nothing",
        detail: `Reachable but returned no listings across ${mine.length} run(s).`,
      };
    }

    return {
      ...base,
      status: "healthy",
      detail: `Kept ${totalKept} of ${totalFetched} fetched across ${mine.length} run(s).`,
    };
  });
}

/** True when at least one source needs a human to look at it. */
export function needsAttention(health: SourceHealth[]): boolean {
  return health.some(
    (h) => h.status === "failing" || h.status === "degraded" || h.status === "never_run"
  );
}
