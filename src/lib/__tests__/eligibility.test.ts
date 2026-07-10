import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/lib/eligibility";

const me = { cgpa: 3.4, department: "CSE", year: 8 };

describe("evaluateEligibility", () => {
  it("qualifies when every hard rule is met", () => {
    const r = evaluateEligibility(me, {
      min_cgpa: 3.2,
      min_semester: 7,
      allowed_departments: ["CSE", "SWE"],
    });
    expect(r.status).toBe("qualify");
    expect(r.checks.every((c) => c.state === "met")).toBe(true);
  });

  it("is borderline on a near-miss CGPA (within 0.15)", () => {
    const r = evaluateEligibility(me, { min_cgpa: 3.5 });
    expect(r.status).toBe("borderline");
    expect(r.checks[0].state).toBe("missing");
  });

  it("is ineligible on a big CGPA miss", () => {
    const r = evaluateEligibility(me, { min_cgpa: 3.8 });
    expect(r.status).toBe("ineligible");
  });

  it("is borderline when one semester short", () => {
    const r = evaluateEligibility(me, { min_semester: 9 });
    expect(r.status).toBe("borderline");
  });

  it("is ineligible when two semesters short", () => {
    const r = evaluateEligibility(me, { min_semester: 10 });
    expect(r.status).toBe("ineligible");
  });

  it("treats a wrong department as a hard gate, never borderline", () => {
    const r = evaluateEligibility(me, { allowed_departments: ["EEE"] });
    expect(r.status).toBe("ineligible");
  });

  it("department match is case-insensitive", () => {
    const r = evaluateEligibility(me, { allowed_departments: ["cse"] });
    expect(r.status).toBe("qualify");
  });

  it("soft other_text becomes an unknown check and doesn't block qualify", () => {
    const r = evaluateEligibility(me, {
      min_cgpa: 3.0,
      other_text: "Strong SQL preferred",
    });
    expect(r.status).toBe("qualify");
    expect(r.checks.find((c) => c.id === "other")?.state).toBe("unknown");
  });

  it("no rules at all → qualify with zero checks", () => {
    const r = evaluateEligibility(me, {});
    expect(r.status).toBe("qualify");
    expect(r.checks).toHaveLength(0);
  });

  it("borderline on one axis + hard miss on another → ineligible", () => {
    const r = evaluateEligibility(me, {
      min_cgpa: 3.5, // near miss
      allowed_departments: ["EEE"], // hard miss
    });
    expect(r.status).toBe("ineligible");
  });
});
