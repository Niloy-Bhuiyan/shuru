/**
 * Adapter contract: a source with no configuration is inactive rather than
 * broken, and every adapter's output obeys the same honesty rules —
 * rolling deadlines, no invented compensation, no eligibility gates.
 */
import { describe, expect, it } from "vitest";
import { ADAPTERS, adapterAvailability, activeAdapters } from "@/lib/ingest/adapters";
import { normalizeLever } from "@/lib/ingest/adapters/lever";
import { normalizeAshby } from "@/lib/ingest/adapters/ashby";
import { normalizeAdzuna } from "@/lib/ingest/adapters/adzuna";

/**
 * ProcessEnv declares NODE_ENV as required, but the adapters only ever read
 * the ingest keys. Build the fixture through one helper rather than casting
 * at each call site.
 */
const env = (vars: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ ...vars }) as unknown as NodeJS.ProcessEnv;

const BARE = env();

describe("availability gating", () => {
  it("keyless sources are on by default, keyed sources are not", () => {
    const byName = Object.fromEntries(
      adapterAvailability(BARE).map((a) => [a.source, a])
    );
    expect(byName.remoteok.available).toBe(true);
    expect(byName.arbeitnow.available).toBe(true);
    expect(byName.lever.available).toBe(false);
    expect(byName.ashby.available).toBe(false);
    expect(byName.adzuna.available).toBe(false);
  });

  it("explains why an inactive source is inactive", () => {
    for (const a of adapterAvailability(BARE).filter((x) => !x.available)) {
      expect(a.reason).toBeTruthy();
    }
  });

  it("a keyless source can be switched off", () => {
    const bare = env({ INGEST_REMOTEOK_ENABLED: "false" });
    expect(activeAdapters(bare).map((a) => a.source)).not.toContain("remoteok");
  });

  it("configuring boards activates lever and ashby", () => {
    const configured = env({
      LEVER_COMPANIES: "acme",
      ASHBY_COMPANIES: "globex",
      ADZUNA_APP_ID: "id",
      ADZUNA_APP_KEY: "key",
    });
    const active = activeAdapters(configured).map((a) => a.source);
    expect(active).toContain("lever");
    expect(active).toContain("ashby");
    expect(active).toContain("adzuna");
  });

  it("every adapter has a unique source name", () => {
    const names = ADAPTERS.map((a) => a.source);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("normalizeLever", () => {
  const postings = [
    {
      id: "abc-123",
      text: "Software Engineering Intern",
      hostedUrl: "https://jobs.lever.co/acme/abc-123",
      createdAt: Date.parse("2026-08-01T00:00:00Z"),
      categories: { location: "Dhaka", commitment: "Intern", team: "Engineering" },
      workplaceType: "remote",
      descriptionPlain: "Work on the platform.",
    },
    // senior role — must be filtered out
    {
      id: "def-456",
      text: "Senior Staff Engineer",
      createdAt: Date.parse("2026-08-01T00:00:00Z"),
      categories: { location: "Dhaka", commitment: "Full-time" },
    },
  ];

  it("keeps intern-family tech roles and drops seniority", () => {
    const out = normalizeLever(postings, "acme");
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("Software Engineering Intern");
    expect(out[0].company).toBe("acme");
  });

  it("attributes the source and marks the deadline rolling", () => {
    const [row] = normalizeLever(postings, "acme");
    expect(row.source).toBe("lever");
    expect(row.source_ref).toBe("abc-123");
    expect(row.deadline_is_rolling).toBe(true);
    expect(row.cycle_label).toContain("Lever");
  });

  it("never claims compensation the board did not state", () => {
    const [row] = normalizeLever(postings, "acme");
    expect(row.is_paid).toBe(false);
    expect(row.compensation_stated).toBe(false);
    expect(row.eligibility_rules.other_text).toContain("not stated");
  });

  it("invents no eligibility gates, so Reality Check abstains", () => {
    const [row] = normalizeLever(postings, "acme");
    expect(row.eligibility_rules.min_cgpa).toBeNull();
    expect(row.eligibility_rules.min_semester).toBeNull();
    expect(row.eligibility_rules.allowed_departments).toBeNull();
  });

  it("returns nothing for a malformed payload", () => {
    expect(normalizeLever(null, "acme")).toEqual([]);
    expect(normalizeLever({ nope: true }, "acme")).toEqual([]);
  });

  it("is deterministic — the same posting yields the same id", () => {
    const a = normalizeLever(postings, "acme")[0];
    const b = normalizeLever(postings, "acme")[0];
    expect(a.id).toBe(b.id);
  });
});

describe("normalizeAshby", () => {
  const body = {
    name: "Globex",
    jobs: [
      {
        id: "j1",
        title: "Data Science Intern",
        location: "Remote",
        employmentType: "Intern",
        isRemote: true,
        publishedAt: "2026-08-05T00:00:00Z",
        jobUrl: "https://jobs.ashbyhq.com/globex/j1",
      },
      {
        id: "j2",
        title: "VP of Engineering",
        employmentType: "FullTime",
        publishedAt: "2026-08-05T00:00:00Z",
      },
    ],
  };

  it("prefers the board's own company name over the slug", () => {
    const out = normalizeAshby(body, "globex-slug");
    expect(out).toHaveLength(1);
    expect(out[0].company).toBe("Globex");
  });

  it("carries remote work mode and source attribution", () => {
    const [row] = normalizeAshby(body, "globex");
    expect(row.work_mode).toBe("remote");
    expect(row.source).toBe("ashby");
    expect(row.source_ref).toBe("j1");
  });

  it("returns nothing when jobs is absent", () => {
    expect(normalizeAshby({ name: "X" }, "x")).toEqual([]);
  });
});

describe("normalizeAdzuna", () => {
  const payload = {
    results: [
      {
        id: "999",
        title: "Frontend Developer Intern",
        description: "React internship",
        created: "2026-08-10T00:00:00Z",
        company: { display_name: "Initech" },
        location: { display_name: "London" },
        redirect_url: "https://adzuna.example/999",
        salary_min: 20000,
        salary_max: 24000,
      },
    ],
  };

  it("treats a real salary as compensation evidence", () => {
    const [row] = normalizeAdzuna(payload);
    expect(row.is_paid).toBe(true);
    expect(row.compensation_stated).toBe(true);
    expect(row.stipend_text).toContain("20000");
  });

  it("does NOT treat an Adzuna-predicted salary as evidence", () => {
    const predicted = {
      results: [{ ...payload.results[0], salary_is_predicted: "1" }],
    };
    const [row] = normalizeAdzuna(predicted);
    // the figure is Adzuna's guess, not the employer's claim
    expect(row.is_paid).toBe(false);
    expect(row.compensation_stated).toBe(false);
    expect(row.stipend_text).toBeNull();
  });

  it("skips rows with no company", () => {
    expect(normalizeAdzuna({ results: [{ title: "Intern Developer" }] })).toEqual([]);
  });
});
