/**
 * Guards the demo experience: the bundled seed must produce all three
 * confidence tiers (HIGH / MED / ABSTAIN) and real "ONE THING" insights
 * for a typical user profile. If seed generation changes, this fails loudly.
 */
import { describe, expect, it } from "vitest";
import { SEED_OPPORTUNITIES, SEED_OUTCOMES } from "@/lib/data/seed";
import { realityCheck } from "@/lib/realityCheck";

const me = {
  cgpa: 3.4,
  dept: "CSE",
  year: 8,
  has_projects: true,
  has_deployed_project: false,
};

describe("seed → realityCheck integration", () => {
  it("produces HIGH, MED and ABSTAIN across the 30 listings", () => {
    const kinds = { HIGH: 0, MED: 0, ABSTAIN: 0 };
    for (const op of SEED_OPPORTUNITIES) {
      const outs = SEED_OUTCOMES.filter((o) => o.opportunity_id === op.id);
      const r = realityCheck(me, outs);
      if (r.kind === "abstain") kinds.ABSTAIN++;
      else kinds[r.confidence]++;
    }
    expect(kinds.HIGH).toBeGreaterThan(0);
    expect(kinds.MED).toBeGreaterThan(0);
    expect(kinds.ABSTAIN).toBeGreaterThan(5);
  });

  it("several listings yield a ONE THING insight", () => {
    let found = 0;
    for (const op of SEED_OPPORTUNITIES) {
      const outs = SEED_OUTCOMES.filter((o) => o.opportunity_id === op.id);
      const r = realityCheck(me, outs);
      if (r.kind === "odds" && r.oneThing) found++;
    }
    expect(found).toBeGreaterThan(3);
  });
});
