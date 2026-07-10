/**
 * Demo-mode merge: ingested rows join the curated seed by id, curated
 * always wins on clash, and listings stay deadline-sorted. Runs in demo
 * mode (no Supabase env) with a localStorage shim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// minimal localStorage for the data layer's lsGet/lsSet (reads window.localStorage)
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("localStorage", ls);
});

import { listOpportunities, mergeIngested } from "@/lib/data";
import { SEED_OPPORTUNITIES } from "@/lib/data/seed";
import { deterministicId } from "@/lib/ingest/normalize";
import type { Opportunity } from "@/lib/types";

function remoteRow(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: deterministicId("remoteok", "test-1"),
    company: "Acme Cloud",
    role: "Junior Backend Developer",
    location: "Remote",
    duration: "Not specified",
    is_paid: true,
    deadline: "2026-07-31",
    eligibility_rules: { min_cgpa: null, min_semester: null, allowed_departments: null, other_text: "x" },
    source_url: "https://remoteok.com/x",
    is_verified: false,
    cycle_label: "Rolling · via RemoteOK",
    ...over,
  };
}

describe("mergeIngested + listOpportunities (demo)", () => {
  it("adds ingested rows to the curated seed", async () => {
    const before = (await listOpportunities()).length;
    mergeIngested([remoteRow()]);
    const after = await listOpportunities();
    expect(after.length).toBe(before + 1);
    expect(after.find((o) => o.cycle_label.includes("RemoteOK"))).toBeTruthy();
  });

  it("upserts by id — refreshing the same row doesn't duplicate", async () => {
    mergeIngested([remoteRow()]);
    mergeIngested([remoteRow({ role: "Junior Backend Developer (Updated)" })]);
    const rows = await listOpportunities();
    const mine = rows.filter((o) => o.id === deterministicId("remoteok", "test-1"));
    expect(mine).toHaveLength(1);
    expect(mine[0].role).toContain("Updated");
  });

  it("never overrides a curated seed row sharing an id", async () => {
    const seed = SEED_OPPORTUNITIES[0];
    mergeIngested([remoteRow({ id: seed.id, company: "IMPOSTER", is_verified: false })]);
    const rows = await listOpportunities();
    const row = rows.find((o) => o.id === seed.id)!;
    expect(row.company).toBe(seed.company);
    expect(row.is_verified).toBe(true);
  });

  it("keeps the list deadline-sorted after merge", async () => {
    mergeIngested([remoteRow({ deadline: "2026-01-01" })]);
    const rows = await listOpportunities();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].deadline.localeCompare(rows[i].deadline)).toBeLessThanOrEqual(0);
    }
  });
});
