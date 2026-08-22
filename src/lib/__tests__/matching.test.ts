/**
 * Match engine.
 *
 * The behaviour worth protecting is the abstention: ingested listings usually
 * state no skills, no work mode and no eligibility rules, and the engine must
 * refuse to score those rather than rank them at zero.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_COVERAGE,
  matchScore,
  meetsAlertThreshold,
  rankOpportunities,
} from "@/lib/matching";
import type { Opportunity, Profile } from "@/lib/types";

const profile: Profile = {
  user_id: "u1",
  name: "Rafid",
  university: "BUET",
  department: "CSE",
  year: 6,
  cgpa: 3.5,
  skills: ["React", "TypeScript", "SQL"],
  has_deployed_project: true,
  language_pref: "en",
  preferred_locations: ["Dhaka"],
  preferred_work_modes: ["remote", "hybrid"],
};

function op(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "o1",
    company: "Acme",
    role: "Frontend Intern",
    location: "Dhaka, Bangladesh",
    duration: "3 months",
    is_paid: true,
    deadline: "2026-12-01",
    eligibility_rules: {},
    source_url: null,
    is_verified: true,
    cycle_label: "2026",
    ...over,
  };
}

describe("matchScore — abstention", () => {
  it("abstains when the listing states nothing judgeable", () => {
    // no skills, no rules, no work mode: only location is judgeable (0.1)
    const result = matchScore(profile, op());
    expect(result.score).toBeNull();
    expect(result.coverage).toBeLessThan(MIN_COVERAGE);
    expect(result.reason).toMatch(/not enough stated detail/i);
  });

  it("marks each unjudgeable component null with a reason", () => {
    const result = matchScore(profile, op());
    const skills = result.components.find((c) => c.id === "skills");
    expect(skills?.score).toBeNull();
    expect(skills?.detail).toMatch(/does not state required skills/i);
  });

  it("scores once enough of the listing is stated", () => {
    const result = matchScore(
      profile,
      op({ skills_required: ["React", "TypeScript"], work_mode: "remote" })
    );
    expect(result.score).not.toBeNull();
    expect(result.coverage).toBeGreaterThanOrEqual(MIN_COVERAGE);
  });
});

describe("matchScore — real ingested listings", () => {
  /**
   * The exact shape Arbeitnow rows land in (verified against the live
   * database): a role title, a location, a work mode, and an
   * eligibility_rules blob whose hard rules are all null — the only content
   * is an `other_text` note. No skills, no description, no requirements.
   *
   * Scoring this would mean calling someone a strong match on "remote and in
   * Dhaka" alone, so the engine must abstain. If a future change makes this
   * return a number, that number is not backed by data.
   */
  const ingested = op({
    role: "Frontend Developer Intern",
    work_mode: "remote",
    skills_required: [],
    eligibility_rules: {
      min_cgpa: null,
      min_semester: null,
      allowed_departments: null,
      other_text:
        "Remote listing via Arbeitnow. Compensation not stated by source. Requirements not structured — read the posting.",
    },
  });

  it("abstains: an other_text note is not a stated eligibility rule", () => {
    const result = matchScore(profile, ingested);
    expect(result.components.find((c) => c.id === "eligibility")?.score).toBeNull();
  });

  it("abstains overall — only preferences are judgeable", () => {
    const result = matchScore(profile, ingested);
    expect(result.score).toBeNull();
    expect(result.coverage).toBeCloseTo(0.2, 5);
  });
});

describe("matchScore — skills", () => {
  it("is a share of what the listing asked for, not of what the student knows", () => {
    const result = matchScore(
      profile,
      op({ skills_required: ["React", "TypeScript"], work_mode: "remote" })
    );
    const skills = result.components.find((c) => c.id === "skills");
    // holds 3 skills, both requirements met → full credit
    expect(skills?.score).toBe(1);
  });

  it("is case and whitespace insensitive", () => {
    const result = matchScore(
      profile,
      op({ skills_required: ["  react ", "SQL"], work_mode: "remote" })
    );
    expect(result.components.find((c) => c.id === "skills")?.score).toBe(1);
  });

  it("gives partial credit for partial overlap", () => {
    const result = matchScore(
      profile,
      op({ skills_required: ["React", "Rust", "Go", "Kubernetes"], work_mode: "remote" })
    );
    expect(result.components.find((c) => c.id === "skills")?.score).toBe(0.25);
  });
});

describe("matchScore — eligibility", () => {
  it("forces the whole score to 0 on a hard miss, despite perfect skills", () => {
    const result = matchScore(
      profile,
      op({
        skills_required: ["React", "TypeScript", "SQL"],
        work_mode: "remote",
        eligibility_rules: { allowed_departments: ["EEE"] },
      })
    );
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/hard requirement/i);
  });

  it("treats a near miss as half credit rather than a rejection", () => {
    const result = matchScore(
      profile,
      op({
        skills_required: ["React"],
        eligibility_rules: { min_cgpa: 3.6 }, // 0.10 short → borderline
      })
    );
    expect(result.components.find((c) => c.id === "eligibility")?.score).toBe(0.5);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("matchScore — preferences", () => {
  it("matches a city against a fuller location string", () => {
    const result = matchScore(profile, op({ skills_required: ["React"] }));
    expect(result.components.find((c) => c.id === "location")?.score).toBe(1);
  });

  it("scores a non-preferred work mode at zero without abstaining", () => {
    const result = matchScore(
      profile,
      op({ skills_required: ["React"], work_mode: "onsite" })
    );
    expect(result.components.find((c) => c.id === "work_mode")?.score).toBe(0);
  });

  it("abstains on preferences the profile has not set", () => {
    const bare: Profile = { ...profile, preferred_locations: [], preferred_work_modes: [] };
    const result = matchScore(bare, op({ skills_required: ["React"], work_mode: "remote" }));
    expect(result.components.find((c) => c.id === "location")?.score).toBeNull();
    expect(result.components.find((c) => c.id === "work_mode")?.score).toBeNull();
  });
});

describe("rankOpportunities", () => {
  it("orders by score and sinks abstentions to the bottom", () => {
    const strong = op({ id: "strong", skills_required: ["React", "TypeScript"], work_mode: "remote" });
    const weak = op({ id: "weak", skills_required: ["Rust", "Go"], work_mode: "onsite" });
    const unknown = op({ id: "unknown" });

    const ranked = rankOpportunities(profile, [unknown, weak, strong]);
    expect(ranked.map((r) => r.opportunity.id)).toEqual(["strong", "weak", "unknown"]);
    expect(ranked[2].match.score).toBeNull();
  });

  it("returns one entry per listing", () => {
    expect(rankOpportunities(profile, [op({ id: "a" }), op({ id: "b" })])).toHaveLength(2);
  });
});

describe("meetsAlertThreshold", () => {
  it("passes a listing at or above the floor", () => {
    const match = matchScore(
      profile,
      op({ skills_required: ["React", "TypeScript"], work_mode: "remote" })
    );
    expect(meetsAlertThreshold(match, 60)).toBe(true);
  });

  it("never alerts on an abstention", () => {
    const match = matchScore(profile, op());
    expect(match.score).toBeNull();
    expect(meetsAlertThreshold(match, 0)).toBe(false);
  });
});
