/**
 * Tools must WRAP the existing engines, never fork them — several tests
 * assert tool output equals calling the engine directly on the same data.
 *
 * The tools read through supabaseServer(), which is stubbed here with an
 * in-memory table set seeded from the bundled fixtures. Each test can adjust
 * `db` to model a user with no profile, no resume, and so on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { realityCheck, snapshotFromProfile } from "@/lib/realityCheck";
import { computeAts } from "@/lib/resume/ats";
import { SEED_OPPORTUNITIES, SEED_OUTCOMES } from "@/lib/data/seed";
import { emptyResumeContent } from "@/lib/types";
import type { Profile, Resume } from "@/lib/types";

const USER_ID = "u1";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  opportunities: [] as Row[],
  outcomes: [] as Row[],
  profiles: [] as Row[],
  resumes: [] as Row[],
  applications: [] as Row[],
  user: null as { id: string } | null,
}));

vi.mock("@/lib/supabase/server", () => {
  /** Minimal chainable stand-in for the PostgREST query builder. */
  function builder(rows: Row[]) {
    let out = rows;
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        out = out.filter((r) => r[col] === val);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        out = out.filter((r) => vals.includes(r[col]));
        return b;
      },
      order: () => b,
      limit: (n: number) => {
        out = out.slice(0, n);
        return b;
      },
      update: () => b,
      insert: () => b,
      upsert: () => b,
      maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
      single: async () => ({ data: out[0] ?? null, error: null }),
      // makes a bare `await query` resolve like PostgREST does
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: out, error: null }),
    };
    return b;
  }

  return {
    supabaseServer: () => ({
      from: (table: string) =>
        builder([...(((db as unknown) as Record<string, Row[]>)[table] ?? [])]),
      auth: { getUser: async () => ({ data: { user: db.user }, error: null }) },
    }),
    supabaseServiceRole: () => {
      throw new Error("not used in these tests");
    },
  };
});

const profile: Profile = {
  user_id: USER_ID,
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
  id: "resume-1",
  user_id: USER_ID,
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

const ctx = {};

beforeEach(() => {
  db.opportunities = SEED_OPPORTUNITIES as unknown as Row[];
  db.outcomes = SEED_OUTCOMES as unknown as Row[];
  db.profiles = [profile as unknown as Row];
  db.resumes = [resume as unknown as Row];
  db.applications = [];
  db.user = { id: USER_ID };
});

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
    for (const r of results) {
      expect(r.company.toLowerCase()).toContain("bkash");
      expect(r.id).toBeTruthy();
    }
  });

  it("respects paid_only and the limit cap", async () => {
    const out = parse(
      await executeTool(
        {
          id: "1",
          name: "search_opportunities",
          input: { query: "", paid_only: true, limit: 3, open_only: false },
        },
        ctx
      )
    );
    const results = out.results as unknown[];
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe("get_user_profile", () => {
  it("returns the signed-in user's profile", async () => {
    const out = parse(await executeTool({ id: "1", name: "get_user_profile", input: {} }, ctx));
    expect(out.cgpa).toBe(3.75);
    expect(out.department).toBe("CSE");
  });

  it("errors informatively without a profile", async () => {
    db.profiles = [];
    const out = parse(await executeTool({ id: "1", name: "get_user_profile", input: {} }, ctx));
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
    db.resumes = [];
    const out = parse(await executeTool({ id: "1", name: "get_ats_analysis", input: {} }, ctx));
    expect(String(out.error)).toContain("Resume Forge");
  });
});

describe("update_application_status", () => {
  it("writes the status for the signed-in user", async () => {
    const opp = SEED_OPPORTUNITIES[0];
    const exec = await executeTool(
      {
        id: "1",
        name: "update_application_status",
        input: { opportunity_id: opp.id, status: "applied" },
      },
      ctx
    );
    const out = parse(exec);
    expect(out.ok).toBe(true);
    expect(out.company).toBe(opp.company);
    expect(out.status).toBe("applied");
  });

  it("refuses to write when nobody is signed in", async () => {
    db.user = null;
    const out = parse(
      await executeTool(
        {
          id: "1",
          name: "update_application_status",
          input: { opportunity_id: SEED_OPPORTUNITIES[0].id, status: "applied" },
        },
        ctx
      )
    );
    expect(String(out.error)).toContain("signed in");
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
