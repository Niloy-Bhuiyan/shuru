import { describe, expect, it } from "vitest";
import { computeAts } from "@/lib/resume/ats";
import { emptyResumeContent } from "@/lib/types";
import type { ResumeContent } from "@/lib/types";

function goodResume(): ResumeContent {
  return {
    ...emptyResumeContent(),
    contact: {
      name: "Niloy Rahman",
      email: "niloy@aiub.edu",
      phone: "+8801712345678",
      location: "Dhaka",
      links: ["github.com/niloy"],
    },
    summary:
      "Final-year CSE student at AIUB focused on uncertainty-aware machine learning, with deployed full-stack projects and a strong record of quantified results across research and coursework in Bangladesh. Comfortable owning problems end to end, from dataset design and model training through evaluation, deployment and clear technical writing for stakeholders.",
    education: [
      { institution: "AIUB", degree: "BSc in CSE", start: "2023", end: "2026", notes: "CGPA 3.95/4.00, dean's list every semester, thesis on medical imaging" },
    ],
    experience: [
      {
        company: "AIUB Research Lab",
        role: "Undergraduate Research Assistant",
        start: "2025",
        end: "2026",
        bullets: [
          "Led experiments across 23 classification categories and improved macro-F1 by 4 points",
          "Wrote evaluation tooling adopted by 4 lab members for weekly benchmark runs",
        ],
      },
    ],
    projects: [
      {
        name: "ChurnHedge",
        link: "churnhedge.vercel.app",
        tech: "Python, XGBoost",
        bullets: [
          "Built an uncertainty-aware churn model reaching 87% AUC on 40,000 customers",
          "Deployed the scoring API to Vercel and cut inference latency by 35%",
        ],
      },
      {
        name: "Bishwas",
        link: "",
        tech: "PyTorch",
        bullets: [
          "Developed a Bengali hallucination detector covering 12,000 support queries",
          "Reduced false escalations by 22% against the production baseline",
          "Shipped evaluation dashboards used by 3 teammates weekly",
        ],
      },
    ],
    skills: ["Python", "PyTorch", "SQL", "React"],
  };
}

describe("computeAts", () => {
  it("scores a strong structured resume at 100", () => {
    const r = computeAts(goodResume());
    expect(r.score).toBe(100);
    expect(r.checks.every((c) => c.state === "met")).toBe(true);
  });

  it("empty resume scores near zero and flags everything except nothing", () => {
    const r = computeAts(emptyResumeContent());
    expect(r.score).toBeLessThanOrEqual(15); // only format-safety can pass
    expect(r.checks.find((c) => c.id === "contact")?.state).toBe("missing");
    expect(r.checks.find((c) => c.id === "headers")?.state).toBe("missing");
  });

  it("flags bad contact info", () => {
    const bad = goodResume();
    bad.contact.email = "not-an-email";
    const r = computeAts(bad);
    expect(r.checks.find((c) => c.id === "contact")?.state).toBe("missing");
  });

  it("flags entries with a single bullet", () => {
    const bad = goodResume();
    bad.projects[0].bullets = ["Built a thing with 90% accuracy"];
    const r = computeAts(bad);
    expect(r.checks.find((c) => c.id === "bullets")?.state).toBe("missing");
  });

  it("flags unquantified bullets", () => {
    const bad = goodResume();
    bad.projects = bad.projects.map((p) => ({
      ...p,
      bullets: p.bullets.map((b) => b.replace(/\d+(\.\d+)?%?|\d+,\d+/g, "many")),
    }));
    const r = computeAts(bad);
    expect(r.checks.find((c) => c.id === "quantified")?.state).toBe("missing");
  });

  it("flags pipe characters as an ATS hazard", () => {
    const bad = goodResume();
    bad.summary += " Skills | Tools | Stack";
    const r = computeAts(bad);
    expect(r.checks.find((c) => c.id === "format")?.state).toBe("missing");
  });
});
