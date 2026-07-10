/**
 * Vault free-text search matcher — covers company, role, question types and
 * round detail, with the "combinable with company chips" behavior verified in
 * the caller (chip filter is applied before this matcher).
 */
import { describe, expect, it } from "vitest";
import { matchesReportQuery } from "@/lib/vaultSearch";
import type { InterviewReport } from "@/lib/types";

const report: InterviewReport = {
  id: "r1",
  company: "bKash",
  role: "Software Engineer Intern",
  rounds: [
    { name: "Technical", format: "Live coding", notes: "system design basics" },
    { name: "HR", format: "Behavioral" },
  ],
  question_types: ["Data structures", "SQL"],
  difficulty: 3,
  apply_to_offer_days: 21,
  author_anon: "anon-1",
};

describe("matchesReportQuery", () => {
  it("matches everything on an empty / whitespace query", () => {
    expect(matchesReportQuery(report, "")).toBe(true);
    expect(matchesReportQuery(report, "   ")).toBe(true);
  });

  it("matches on company and role (case-insensitive)", () => {
    expect(matchesReportQuery(report, "bkash")).toBe(true);
    expect(matchesReportQuery(report, "INTERN")).toBe(true);
  });

  it("matches on question types and round detail (the 'question text')", () => {
    expect(matchesReportQuery(report, "sql")).toBe(true);
    expect(matchesReportQuery(report, "system design")).toBe(true);
    expect(matchesReportQuery(report, "behavioral")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesReportQuery(report, "kubernetes")).toBe(false);
  });

  it("is resilient to reports with sparse rounds", () => {
    const sparse: InterviewReport = {
      ...report,
      rounds: [{ name: "Screen" }],
      question_types: [],
    };
    expect(matchesReportQuery(sparse, "screen")).toBe(true);
    expect(matchesReportQuery(sparse, "sql")).toBe(false);
  });
});
