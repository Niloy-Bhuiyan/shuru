/**
 * Batched data helpers (1.8) must return exactly what the per-item helpers
 * do — just in one query instead of N. Also covers isSeededOpportunity (1.2).
 * Runs in demo mode (no Supabase env), so every branch reads the seed.
 */
import { describe, expect, it } from "vitest";
import {
  countSeniors,
  countSeniorsByCompany,
  isSeededOpportunity,
  listOutcomes,
  listOutcomesForOpportunities,
} from "@/lib/data";
import { SEED_MENTORS, SEED_OPPORTUNITIES } from "@/lib/data/seed";

describe("isSeededOpportunity", () => {
  it("is true for every curated seed row", () => {
    for (const op of SEED_OPPORTUNITIES) {
      expect(isSeededOpportunity(op.id)).toBe(true);
    }
  });
  it("is false for an unknown id", () => {
    expect(isSeededOpportunity("00000000-0000-4000-8000-999999999999")).toBe(false);
  });
});

describe("listOutcomesForOpportunities (batched)", () => {
  it("matches per-id listOutcomes for every seed listing", async () => {
    const ids = SEED_OPPORTUNITIES.map((o) => o.id);
    const grouped = await listOutcomesForOpportunities(ids);

    // every requested id is present
    for (const id of ids) expect(grouped[id]).toBeDefined();

    // parity with the single-fetch path
    for (const id of ids) {
      const single = await listOutcomes(id);
      expect(grouped[id].length).toBe(single.length);
      expect(new Set(grouped[id].map((o) => o.id))).toEqual(
        new Set(single.map((o) => o.id))
      );
    }
  });

  it("returns an empty map shape for no ids", async () => {
    expect(await listOutcomesForOpportunities([])).toEqual({});
  });
});

describe("countSeniorsByCompany (batched)", () => {
  it("matches per-company countSeniors across a university's companies", async () => {
    const university = "BUET";
    const companies = Array.from(
      new Set(
        SEED_MENTORS.filter((m) => m.university === university).map((m) => m.company)
      )
    );
    // include a company with zero matching mentors to prove 0-fill
    companies.push("Company With No Seniors");

    const counts = await countSeniorsByCompany(university, companies);
    for (const company of companies) {
      expect(counts[company]).toBe(await countSeniors(university, company));
    }
    expect(counts["Company With No Seniors"]).toBe(0);
  });

  it("returns an empty map for no companies", async () => {
    expect(await countSeniorsByCompany("AIUB", [])).toEqual({});
  });
});
