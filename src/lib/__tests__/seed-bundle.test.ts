/**
 * Keeps the illustrative seed dataset out of the browser bundle.
 *
 * `src/lib/data/seed.ts` is ~9k lines of sample opportunities, outcomes,
 * interview reports and mentors. It exists as a test fixture and as the mirror
 * of `supabase/seed.sql`. It was once imported by `src/lib/data/index.ts` —
 * a `"use client"` module — purely to build an id `Set` for
 * `isSeededOpportunity()`, which shipped the entire dataset to every visitor.
 *
 * These tests pin both halves of the fix: the split stays split, and the
 * ids-only module stays in sync with the data it was generated from.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_OPPORTUNITIES } from "@/lib/data/seed";
import { SEED_OPPORTUNITY_IDS } from "@/lib/data/seedIds";
import { isSeededOpportunity } from "@/lib/data";

describe("seedIds stays in sync with seed", () => {
  it("lists exactly the seeded opportunity ids, in order", () => {
    expect(SEED_OPPORTUNITY_IDS).toEqual(SEED_OPPORTUNITIES.map((o) => o.id));
  });

  it("recognises a seeded id and rejects a real one", () => {
    expect(isSeededOpportunity(SEED_OPPORTUNITIES[0].id)).toBe(true);
    // shape of a genuinely ingested row's id
    expect(isSeededOpportunity("arbeitnow:some-real-listing")).toBe(false);
  });
});

describe("no shipped module imports the full seed dataset", () => {
  /**
   * Anything reachable from a `"use client"` module ends up in the browser
   * bundle. Rather than trying to walk the import graph, this asserts the
   * simpler and stricter invariant: outside of tests and the generator,
   * `data/seed` has exactly one legitimate importer — nobody.
   */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  it("only test files import @/lib/data/seed", () => {
    const files = sourceFiles("src");
    const offenders = files.filter((f: string) => {
      if (f.includes("__tests__")) return false;
      if (f.replace(/\\/g, "/").endsWith("src/lib/data/seed.ts")) return false;
      const src = readFileSync(f, "utf8");
      return /from\s+["'](?:@\/lib\/data\/seed|\.\/seed|\.\.\/data\/seed)["']/.test(src);
    });
    expect(
      offenders,
      `these modules import the full seed dataset and would ship it to the browser:\n  ${offenders.join(
        "\n  "
      )}\nImport @/lib/data/seedIds instead.`
    ).toEqual([]);
  });
});
