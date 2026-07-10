import { beforeEach, describe, expect, it } from "vitest";
import {
  ARBEITNOW_URL,
  REMOTEOK_URL,
  cooldownRemainingMs,
  markSuccessfulRun,
  runIngest,
  _resetIngestState,
  COOLDOWN_MS,
} from "@/lib/ingest/refresh";
import { deterministicId } from "@/lib/ingest/normalize";
import { REMOTEOK_FIXTURE } from "@/lib/ingest/__fixtures__/remoteok.fixture";
import { ARBEITNOW_FIXTURE } from "@/lib/ingest/__fixtures__/arbeitnow.fixture";
import type { FetchLike } from "@/lib/ingest/refresh";
import type { Opportunity } from "@/lib/types";

beforeEach(() => _resetIngestState());

function fakeFetch(map: Record<string, unknown | "FAIL" | "HTTP500">): FetchLike {
  return async (url: string) => {
    const v = map[url];
    if (v === "FAIL") throw new Error("network down");
    if (v === "HTTP500") return new Response("boom", { status: 500 });
    return new Response(JSON.stringify(v), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const bothOk = {
  [REMOTEOK_URL]: REMOTEOK_FIXTURE,
  [ARBEITNOW_URL]: ARBEITNOW_FIXTURE,
};

describe("runIngest", () => {
  it("merges both sources: fetched counts, normalized rows, accepted set", async () => {
    const r = await runIngest([], fakeFetch(bothOk));
    expect(r.fetched.remoteok).toBe(REMOTEOK_FIXTURE.length);
    expect(r.fetched.arbeitnow).toBe(ARBEITNOW_FIXTURE.data.length);
    // 2 survive from RemoteOK fixture + 2 from Arbeitnow (see ingest.test.ts)
    expect(r.accepted.map((o) => o.company).sort()).toEqual([
      "Acme Cloud",
      "Berlin Webworks",
      "DataNest",
      "Datenhaus GmbH",
    ]);
    expect(r.refreshed).toBe(0);
    expect(r.skipped).toBe(0);
  });

  it("one source failing never kills the other", async () => {
    const r = await runIngest(
      [],
      fakeFetch({ [REMOTEOK_URL]: "FAIL", [ARBEITNOW_URL]: ARBEITNOW_FIXTURE })
    );
    expect(r.fetched.remoteok).toBeNull();
    expect(r.fetched.arbeitnow).toBe(ARBEITNOW_FIXTURE.data.length);
    expect(r.accepted.map((o) => o.company).sort()).toEqual([
      "Berlin Webworks",
      "Datenhaus GmbH",
    ]);
  });

  it("treats HTTP errors like failures and survives both sources down", async () => {
    const r = await runIngest(
      [],
      fakeFetch({ [REMOTEOK_URL]: "HTTP500", [ARBEITNOW_URL]: "FAIL" })
    );
    expect(r.fetched).toEqual({ remoteok: null, arbeitnow: null });
    expect(r.accepted).toEqual([]);
  });

  it("re-running: already-stored ids become refreshes, not duplicates", async () => {
    const first = await runIngest([], fakeFetch(bothOk));
    const second = await runIngest(first.accepted, fakeFetch(bothOk));
    expect(second.refreshed).toBe(first.accepted.length);
    expect(second.accepted).toHaveLength(first.accepted.length); // same rows, as updates
    expect(second.skipped).toBe(0);
    // and the ids really are the deterministic ones
    expect(second.accepted.map((o) => o.id)).toContain(deterministicId("remoteok", "1092001"));
  });

  it("fuzzy-duplicate rows with DIFFERENT ids are skipped, not refreshed", async () => {
    const first = await runIngest([], fakeFetch(bothOk));
    const acme = first.accepted.find((o) => o.company === "Acme Cloud")!;
    // pretend an earlier run stored the same company+role under another id
    const stored: Opportunity = { ...acme, id: "99999999-9999-4999-8999-999999999999" };
    const r = await runIngest([stored], fakeFetch(bothOk));
    expect(r.accepted.find((o) => o.company === "Acme Cloud")).toBeUndefined();
    expect(r.skipped).toBeGreaterThan(0);
  });

  it("malformed JSON body from a source is survived", async () => {
    const badFetch: FetchLike = async (url: string) =>
      url === REMOTEOK_URL
        ? new Response("<html>not json</html>", { status: 200 })
        : new Response(JSON.stringify(ARBEITNOW_FIXTURE), { status: 200 });
    const r = await runIngest([], badFetch);
    expect(r.fetched.remoteok).toBeNull();
    expect(r.accepted.length).toBe(2);
  });
});

describe("cooldown", () => {
  it("counts down from a successful run and resets via the hook", () => {
    expect(cooldownRemainingMs()).toBe(0);
    const now = 1_000_000_000;
    markSuccessfulRun(now);
    expect(cooldownRemainingMs(now + 1000)).toBe(COOLDOWN_MS - 1000);
    expect(cooldownRemainingMs(now + COOLDOWN_MS)).toBe(0);
    markSuccessfulRun(now);
    _resetIngestState();
    expect(cooldownRemainingMs(now + 1000)).toBe(0);
  });
});
