/**
 * INGEST DEDUPLICATION — pure. Two layers, both against EVERYTHING already
 * known (curated seed + previously stored rows) and within the incoming
 * batch itself:
 *   1. exact id  — deterministic ids make refresh idempotent
 *   2. fuzzy key — lowercased, punctuation-stripped `company|role`, so
 *      "bKash Ltd." / "SWE Intern" collides with "bkash ltd" / "swe intern"
 */

import type { Opportunity } from "@/lib/types";

/** Exported for tests. */
export function fuzzyKey(company: string, role: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(ltd|limited|inc|llc|gmbh|pvt)\b\.?/g, "")
      .replace(/[^a-z0-9\u0980-\u09ff]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  return `${clean(company)}|${clean(role)}`;
}

export function dedupe(
  incoming: Opportunity[],
  existing: Opportunity[]
): Opportunity[] {
  const ids = new Set(existing.map((o) => o.id));
  const keys = new Set(existing.map((o) => fuzzyKey(o.company, o.role)));

  const out: Opportunity[] = [];
  for (const o of incoming) {
    const key = fuzzyKey(o.company, o.role);
    if (ids.has(o.id) || keys.has(key)) continue;
    ids.add(o.id);
    keys.add(key);
    out.push(o);
  }
  return out;
}
