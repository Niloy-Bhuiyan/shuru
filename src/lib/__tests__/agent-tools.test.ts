/**
 * Tools must WRAP the existing engines, never fork them — several tests
 * assert tool output equals calling the engine directly on the same data.
 * Demo mode is active in tests (no Supabase env), so listings/outcomes come
 * from the bundled seed and user data from a demoContext snapshot.
 */
import { describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { realityCheck, snapshotFromProfile } from "@/lib/realityCheck";
import { computeAts } from "@/lib/resume/ats";
import { SEED_OPPORTUNITIES, SEED_OUTCOMES } from "@/lib/data/seed";
import { emptyResumeContent } from "@/lib/types";
import type { Profile, Resume } from "@/lib/types";

const profile: Profile = {
  user_id: "demo",
  name: "Niloy",
  university: "AIUB",
  department: "CSE",
  year: 8,
  cgpa: 3.75,
  skills: ["Python", "PyTorch", "SQL"],
  has_deployed_project: true,
  language_pref: "en",
};

const resume: Resume = {
  id: "local-resume",
  user_id: "demo",
  title: "My Resume",
  content: {
    ...emptyResumeContent(),
    contact: {
      name: "Niloy",
      email: "n@aiub.edu",
      phone: "+8801712345678",
      location: "Dhaka",
      links: [],
    },
    summary: "CSE student.",
    skills: ["Python"],
  },
  updated_at: new Date().toISOString(),
};

const ctx = { demoContext: { profile, applications: [], resume } };

function parse(r: { result: string }) {
  return JSON.parse(r.result) as Record<string, unknown>;
}

describe("search_opportunities", () => {
  it("finds seed listings by company text with eligibility attached", async () => {
    const out = parse(
      await executeTool(
        { id: "1", name: "search_opportunities", input: { query: "bkash", open_only: false } },
        ctx
      )
    );
    const results = out.results as { company: string; eligibility: string | null; id: string }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].company.toLowerCase()).toContain("bkash");
    expect(["qualify", "borderline", "ineligible"]).toContain(results[0].eligibility);
  });

  it("respects paid_only and the limit cap", async () => {
    const out = parse(
      await executeTool(
        {
          id: "1",
          name: "search_opportunities",
          input: { paid_only: true, open_only: false, limit: 99 },
        },
        ctx
      )
    );
    const results = out.results as { is_paid: boolean }[];
    expect(results.length).toBeLessThanOrEqual(15);
    expect(results.every((r) => r.is_paid)).toBe(true);
  });
});

describe("get_user_profile", () => {
  it("returns the demoContext profile", async () => {
    const out = parse(await executeTool({ id: "1", name: "get_user_profile", input: {} }, ctx));
    expect(out.cgpa).toBe(3.75);
    expect(out.department).toBe("CSE");
  });

  it("errors informatively without a profile", async () => {
    const out = parse(
      await executeTool(
        { id: "1", name: "get_user_profile", input: {} },
        { demoContext: { profile: null, applications: [], resume: null } }
      )
    );
    expect(String(out.error)).toContain("profile");
  });
});

describe("get_reality_check", () => {
  it("matches the existing engine exactly for a seed opportunity", async () => {
    const opp = SEED_OPPORTUNITIES[0];
    const direct = realityCheck(
      snapshotFromProfile(profile),
      SEED_OUTCOMES.filter((o) => o.opportunity_id === opp.id)
    );
    const out = parse(
      await executeTool(
        { id: "1", name: "get_reality_check", input: { opportunity_id: opp.id } },
        ctx
      )
    );
    if (direct.kind === "odds") {
      expect(out.kind).toBe("odds");
      expect(out.percent).toBe(direct.percent);
      expect(out.confidence).toBe(direct.confidence);
      expect(out.based_on_n_similar_applicants).toBe(direct.n);
    } else {
      expect(out.kind).toBe("abstain");
      expect(String(out.reason)).toContain("invent");
    }
  });

  it("rejects unknown opportunity ids", async () => {
    const out = parse(
      await executeTool(
        { id: "1", name: "get_reality_check", input: { opportunity_id: "nope" } },
        ctx
      )
    );
    expect(out.error).toBeTruthy();
  });
});

describe("get_ats_analysis", () => {
  it("matches computeAts on the saved resume", async () => {
    const direct = computeAts(resume.content);
    const out = parse(await executeTool({ id: "1", name: "get_ats_analysis", input: {} }, ctx));
    expect(out.score).toBe(direct.score);
    expect((out.checks as unknown[]).length).toBe(direct.checks.length);
  });

  it("errors informatively without a resume", async () => {
    const out = parse(
      await executeTool(
        { id: "1", name: "get_ats_analysis", input: {} },
        { demoContext: { profile, applications: [], resume: null } }
      )
    );
    expect(String(out.error)).toContain("Resume Forge");
  });
});

describe("update_application_status", () => {
  it("returns a client mutation in demo mode (server can't write localStorage)", async () => {
    const opp = SEED_OPPORTUNITIES[0];
    const exec = await executeTool(
      {
        id: "1",
        name: "update_application_status",
        input: { opportunity_id: opp.id, status: "applied" },
      },
      ctx
    );
    expect(exec.mutation).toEqual({
      type: "application_status",
      opportunity_id: opp.id,
      status: "applied",
    });
    expect(parse(exec).ok).toBe(true);
  });

  it("rejects invalid statuses", async () => {
    const out = parse(
      await executeTool(
        {
          id: "1",
          name: "update_application_status",
          input: { opportunity_id: SEED_OPPORTUNITIES[0].id, status: "ghosted" },
        },
        ctx
      )
    );
    expect(out.error).toBeTruthy();
  });
});

describe("dispatcher", () => {
  it("handles unknown tools gracefully", async () => {
    const out = parse(await executeTool({ id: "1", name: "hack_the_db", input: {} }, ctx));
    expect(String(out.error)).toContain("Unknown tool");
  });
});
