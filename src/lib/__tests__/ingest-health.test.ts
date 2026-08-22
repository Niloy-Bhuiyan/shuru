/**
 * Source health verdicts.
 *
 * The case that motivated this module: a source that fetches plenty and keeps
 * nothing is NOT reported as an error (RemoteOK legitimately carries no tech
 * internships for long stretches), but it must not be reported as healthy
 * either — that is exactly how a silently-changed payload hides.
 */
import { describe, expect, it } from "vitest";
import { assessSourceHealth, needsAttention } from "@/lib/ingest/health";
import type { IngestionRun, InternshipSource } from "@/lib/types";

let seq = 0;
function run(over: Partial<IngestionRun> & { source: InternshipSource }): IngestionRun {
  seq += 1;
  return {
    id: `run-${seq}`,
    started_at: `2026-08-2${seq % 10}T00:00:00.000Z`,
    finished_at: null,
    status: "success",
    fetched: 0,
    kept: 0,
    inserted: 0,
    updated: 0,
    expired: 0,
    error: null,
    trigger_source: "manual",
    ...over,
  };
}

describe("assessSourceHealth", () => {
  it("reports a configured source that never ran", () => {
    const [h] = assessSourceHealth([], ["remoteok"]);
    expect(h.status).toBe("never_run");
    expect(h.runs).toBe(0);
  });

  it("calls a source healthy when it keeps some of what it fetches", () => {
    const [h] = assessSourceHealth(
      [run({ source: "arbeitnow", fetched: 175, kept: 12 })],
      ["arbeitnow"]
    );
    expect(h.status).toBe("healthy");
    expect(h.totalKept).toBe(12);
    expect(h.totalFetched).toBe(175);
  });

  it("flags fetched-but-kept-nothing without calling it a failure", () => {
    const [h] = assessSourceHealth(
      [run({ source: "remoteok", fetched: 101, kept: 0 })],
      ["remoteok"]
    );
    expect(h.status).toBe("yielding_nothing");
    // ambiguity is stated rather than resolved
    expect(h.detail).toMatch(/payload changed/);
  });

  it("treats a failed latest run as failing and surfaces the error", () => {
    const [h] = assessSourceHealth(
      [run({ source: "lever", status: "failed", error: "unreachable" })],
      ["lever"]
    );
    expect(h.status).toBe("failing");
    expect(h.detail).toContain("unreachable");
  });

  it("reports degraded when an older run failed but the latest succeeded", () => {
    const older = run({
      source: "ashby",
      status: "failed",
      started_at: "2026-08-01T00:00:00.000Z",
    });
    const newer = run({
      source: "ashby",
      fetched: 10,
      kept: 3,
      started_at: "2026-08-09T00:00:00.000Z",
    });
    const [h] = assessSourceHealth([older, newer], ["ashby"]);
    expect(h.status).toBe("degraded");
    expect(h.runs).toBe(2);
  });

  it("considers only the most recent runs in the window", () => {
    const runs = [
      run({ source: "adzuna", status: "failed", started_at: "2026-08-01T00:00:00.000Z" }),
      run({ source: "adzuna", fetched: 5, kept: 2, started_at: "2026-08-05T00:00:00.000Z" }),
      run({ source: "adzuna", fetched: 5, kept: 2, started_at: "2026-08-06T00:00:00.000Z" }),
    ];
    // a window of 2 excludes the old failure entirely
    const [h] = assessSourceHealth(runs, ["adzuna"], 2);
    expect(h.runs).toBe(2);
    expect(h.status).toBe("healthy");
  });

  it("returns one verdict per configured source, in order", () => {
    const sources: InternshipSource[] = ["remoteok", "arbeitnow"];
    const health = assessSourceHealth([], sources);
    expect(health.map((h) => h.source)).toEqual(sources);
  });
});

describe("needsAttention", () => {
  it("is false when sources are healthy or merely quiet", () => {
    const health = assessSourceHealth(
      [
        run({ source: "arbeitnow", fetched: 175, kept: 12 }),
        run({ source: "remoteok", fetched: 101, kept: 0 }),
      ],
      ["arbeitnow", "remoteok"]
    );
    expect(needsAttention(health)).toBe(false);
  });

  it("is true when any source is failing", () => {
    const health = assessSourceHealth(
      [run({ source: "lever", status: "failed", error: "boom" })],
      ["lever"]
    );
    expect(needsAttention(health)).toBe(true);
  });
});
