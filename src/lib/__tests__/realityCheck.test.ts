import { describe, expect, it } from "vitest";
import { cgpaBand, realityCheck } from "@/lib/realityCheck";
import type { Outcome, OutcomeResult, ProfileSnapshot } from "@/lib/types";

let seq = 0;
function out(
  snapshot: Partial<ProfileSnapshot>,
  result: OutcomeResult
): Outcome {
  seq += 1;
  return {
    id: `t-${seq}`,
    opportunity_id: "op-1",
    profile_snapshot: {
      cgpa: 3.2,
      dept: "CSE",
      year: 8,
      has_projects: false,
      has_deployed_project: false,
      ...snapshot,
    },
    result,
    cycle: "Summer 2025",
  };
}

const me: ProfileSnapshot = {
  cgpa: 3.3,
  dept: "CSE",
  year: 8,
  has_projects: true,
  has_deployed_project: false,
};

describe("cgpaBand", () => {
  it("buckets correctly at the edges", () => {
    expect(cgpaBand(2.99)).toBe("lt3");
    expect(cgpaBand(3.0)).toBe("3to349");
    expect(cgpaBand(3.49)).toBe("3to349");
    expect(cgpaBand(3.5)).toBe("3p5plus");
  });
});

describe("realityCheck — abstention (the soul of the product)", () => {
  it("ABSTAINS below 8 similar outcomes and returns NO number", () => {
    const outcomes = Array.from({ length: 7 }, () =>
      out({}, "shortlisted")
    );
    const r = realityCheck(me, outcomes);
    expect(r.kind).toBe("abstain");
    // @ts-expect-error — percent must not exist on abstain
    expect(r.percent).toBeUndefined();
    if (r.kind === "abstain") {
      expect(r.n).toBe(7);
      expect(r.needed).toBe(8);
    }
  });

  it("abstains when outcomes exist but none share my CGPA band", () => {
    const outcomes = Array.from({ length: 30 }, () =>
      out({ cgpa: 3.9 }, "shortlisted")
    ); // all 3.5+, I'm 3.3
    const r = realityCheck(me, outcomes);
    expect(r.kind).toBe("abstain");
  });
});

describe("realityCheck — odds + confidence tiers", () => {
  it("MED confidence for 8 ≤ n < 20", () => {
    const outcomes = [
      ...Array.from({ length: 3 }, () => out({}, "shortlisted")),
      ...Array.from({ length: 9 }, () => out({}, "rejected")),
    ];
    const r = realityCheck(me, outcomes);
    expect(r.kind).toBe("odds");
    if (r.kind === "odds") {
      expect(r.n).toBe(12);
      expect(r.confidence).toBe("MED");
      expect(r.percent).toBe(25);
      expect(r.cohort).toBe("band+dept");
    }
  });

  it("HIGH confidence at n ≥ 20, and 'offer' counts as success", () => {
    const outcomes = [
      ...Array.from({ length: 4 }, () => out({}, "shortlisted")),
      ...Array.from({ length: 2 }, () => out({}, "offer")),
      ...Array.from({ length: 14 }, () => out({}, "rejected")),
    ];
    const r = realityCheck(me, outcomes);
    expect(r.kind).toBe("odds");
    if (r.kind === "odds") {
      expect(r.n).toBe(20);
      expect(r.confidence).toBe("HIGH");
      expect(r.percent).toBe(30); // (4+2)/20
    }
  });

  it("relaxes to CGPA-band-only cohort when same-dept is too thin", () => {
    const outcomes = [
      ...Array.from({ length: 3 }, () => out({ dept: "CSE" }, "rejected")),
      ...Array.from({ length: 10 }, () => out({ dept: "EEE" }, "shortlisted")),
    ];
    const r = realityCheck(me, outcomes);
    expect(r.kind).toBe("odds");
    if (r.kind === "odds") {
      expect(r.cohort).toBe("band");
      expect(r.n).toBe(13);
    }
  });
});

describe("realityCheck — THE ONE THING / ALREADY IN YOUR FAVOUR", () => {
  it("finds the biggest gap I'm missing, and my strongest existing edge", () => {
    // deployed project → 80% success; no deployed project → 20%
    const outcomes = [
      ...Array.from({ length: 8 }, () =>
        out({ has_deployed_project: true, has_projects: true }, "shortlisted")
      ),
      ...Array.from({ length: 2 }, () =>
        out({ has_deployed_project: true, has_projects: true }, "rejected")
      ),
      ...Array.from({ length: 2 }, () =>
        out({ has_projects: true }, "shortlisted")
      ),
      ...Array.from({ length: 8 }, () => out({}, "rejected")),
    ];
    const r = realityCheck(me, outcomes);
    expect(r.kind).toBe("odds");
    if (r.kind === "odds") {
      // I don't have a deployed project → that's my ONE THING
      expect(r.oneThing?.id).toBe("has_deployed_project");
      expect(r.oneThing!.gap).toBeGreaterThan(0.05);
      // I DO have projects → that's in my favour
      expect(r.inYourFavour?.id).toBe("has_projects");
    }
  });

  it("returns null gaps when no feature splits the cohort", () => {
    const outcomes = Array.from({ length: 10 }, () => out({}, "rejected"));
    const r = realityCheck(me, outcomes);
    if (r.kind === "odds") {
      expect(r.oneThing).toBeNull();
      expect(r.inYourFavour).toBeNull();
    }
  });
});
