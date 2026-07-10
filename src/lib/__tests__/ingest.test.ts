import { describe, expect, it } from "vitest";
import {
  deterministicId,
  matchesFilters,
  normalizeArbeitnow,
  normalizeRemoteOk,
} from "@/lib/ingest/normalize";
import { dedupe, fuzzyKey } from "@/lib/ingest/dedupe";
import { REMOTEOK_FIXTURE } from "@/lib/ingest/__fixtures__/remoteok.fixture";
import { ARBEITNOW_FIXTURE } from "@/lib/ingest/__fixtures__/arbeitnow.fixture";
import { SEED_OPPORTUNITIES } from "@/lib/data/seed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

describe("matchesFilters", () => {
  it("requires an intern-family term AND a tech term", () => {
    expect(matchesFilters("Software Engineering Intern", [])).toBe(true);
    expect(matchesFilters("Junior Recruiter", ["HR"])).toBe(false); // no tech
    expect(matchesFilters("Backend Developer", ["python"])).toBe(false); // no intern-family
  });
  it("hard-excludes seniority regardless of other matches", () => {
    expect(matchesFilters("Senior Machine Learning Engineer", ["intern"])).toBe(false);
    expect(matchesFilters("Head of Engineering", ["junior"])).toBe(false);
  });
});

describe("deterministicId", () => {
  it("is stable, distinct per source id, and UUID-shaped", () => {
    const a = deterministicId("remoteok", "1092001");
    expect(a).toBe(deterministicId("remoteok", "1092001")); // refresh-idempotent
    expect(a).not.toBe(deterministicId("remoteok", "1092002"));
    expect(a).not.toBe(deterministicId("arbeitnow", "1092001")); // source-scoped
    expect(a).toMatch(UUID_RE);
  });
});

describe("normalizeRemoteOk", () => {
  const rows = normalizeRemoteOk(REMOTEOK_FIXTURE);

  it("skips the legal-notice element, seniority, non-tech and unparseable-date rows", () => {
    expect(rows.map((r) => r.company).sort()).toEqual(["Acme Cloud", "DataNest"]);
  });

  it("deadline = posted + 30 days; cycle label never implies a real deadline", () => {
    const acme = rows.find((r) => r.company === "Acme Cloud")!;
    expect(acme.deadline).toBe("2026-07-31");
    expect(acme.cycle_label).toBe("Rolling · via RemoteOK");
  });

  it("is_paid only on salary evidence; otherwise flagged as not stated", () => {
    const acme = rows.find((r) => r.company === "Acme Cloud")!;
    const datanest = rows.find((r) => r.company === "DataNest")!;
    expect(acme.is_paid).toBe(true);
    expect(datanest.is_paid).toBe(false);
    expect(datanest.eligibility_rules.other_text).toContain("not stated");
  });

  it("never gates eligibility and never claims verification", () => {
    for (const r of rows) {
      expect(r.eligibility_rules.min_cgpa).toBeNull();
      expect(r.eligibility_rules.min_semester).toBeNull();
      expect(r.eligibility_rules.allowed_departments).toBeNull();
      expect(r.is_verified).toBe(false);
      expect(r.id).toMatch(UUID_RE);
    }
  });

  it("defaults empty locations to Remote and respects the cap", () => {
    expect(rows.find((r) => r.company === "DataNest")!.location).toBe("Remote");
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      position: "Junior Software Engineer",
      company: `Co ${i}`,
      tags: [],
      date: "2026-07-01T00:00:00+00:00",
      url: "https://example.com",
    }));
    expect(normalizeRemoteOk([{ legal: "notice" }, ...many]).length).toBe(25);
  });

  it("survives garbage input", () => {
    expect(normalizeRemoteOk(null)).toEqual([]);
    expect(normalizeRemoteOk({ not: "an array" })).toEqual([]);
    expect(normalizeRemoteOk([undefined, 42, "x"])).toEqual([]);
  });
});

describe("normalizeArbeitnow", () => {
  const rows = normalizeArbeitnow(ARBEITNOW_FIXTURE);

  it("keeps the two intern-family tech roles, drops Head-of and non-tech", () => {
    expect(rows.map((r) => r.company).sort()).toEqual(["Berlin Webworks", "Datenhaus GmbH"]);
  });

  it("converts unix-seconds created_at and applies +30 days", () => {
    const berlin = rows.find((r) => r.company === "Berlin Webworks")!;
    expect(berlin.deadline).toBe("2025-08-02"); // 2025-07-03 + 30
  });

  it("marks remote-flagged rows and never claims pay without evidence", () => {
    const berlin = rows.find((r) => r.company === "Berlin Webworks")!;
    expect(berlin.location).toBe("Remote (Berlin)");
    expect(rows.every((r) => r.is_paid === false)).toBe(true);
  });

  it("survives garbage input", () => {
    expect(normalizeArbeitnow(null)).toEqual([]);
    expect(normalizeArbeitnow({ data: "nope" })).toEqual([]);
  });
});

describe("dedupe", () => {
  const incoming = normalizeRemoteOk(REMOTEOK_FIXTURE);

  it("drops exact-id repeats (idempotent refresh)", () => {
    expect(dedupe(incoming, incoming)).toEqual([]);
  });

  it("drops fuzzy company+role repeats across punctuation/case/suffix noise", () => {
    expect(fuzzyKey("bKash Ltd.", "SWE Intern!")).toBe(fuzzyKey("bkash", "swe intern"));
    const copy = { ...incoming[0], id: "totally-different-id", company: incoming[0].company + " Ltd." };
    expect(dedupe([copy], incoming)).toEqual([]);
  });

  it("dedupes within the incoming batch itself", () => {
    const twin = { ...incoming[0], id: "another-id" };
    const out = dedupe([incoming[0], twin], []);
    expect(out).toHaveLength(1);
  });

  it("drops rows colliding with the curated seed", () => {
    const seed = SEED_OPPORTUNITIES[0];
    const clash = { ...incoming[0], company: seed.company.toUpperCase(), role: `${seed.role}.` };
    expect(dedupe([clash], SEED_OPPORTUNITIES)).toEqual([]);
    // and a genuinely new row passes through untouched
    expect(dedupe([incoming[1]], SEED_OPPORTUNITIES)).toEqual([incoming[1]]);
  });
});
