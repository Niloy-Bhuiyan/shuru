import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { buildResumePdf, resumeFileName } from "@/lib/resume/pdfExport";
import { emptyResumeContent } from "@/lib/types";
import type { ResumeContent } from "@/lib/types";

function fixture(): ResumeContent {
  return {
    ...emptyResumeContent(),
    contact: {
      name: "Niloy Rahman",
      email: "niloy@aiub.edu",
      phone: "+8801712345678",
      location: "Dhaka",
      links: ["github.com/niloy"],
    },
    summary: "Final-year CSE student building uncertainty-aware ML systems.",
    education: [
      { institution: "AIUB", degree: "BSc in CSE", start: "2023", end: "2026", notes: "CGPA 3.95/4.00" },
    ],
    experience: [
      {
        company: "AIUB Research Lab",
        role: "Research Assistant",
        start: "2025",
        end: "2026",
        bullets: ["Improved macro-F1 by 4 points across 23 classes"],
      },
    ],
    projects: [
      {
        name: "ChurnHedge",
        link: "churnhedge.vercel.app",
        tech: "Python, XGBoost",
        bullets: ["Deployed scoring API and cut latency by 35%"],
      },
    ],
    skills: ["Python", "PyTorch", "SQL"],
  };
}

describe("buildResumePdf (text layer)", () => {
  it("embeds real text in the PDF output — not a rasterized image", () => {
    const doc = buildResumePdf(new jsPDF({ unit: "pt", format: "a4" }), fixture());
    const raw = doc.output() as string;
    // real text ends up in content streams as literal glyph strings;
    // an image-based export would contain none of these
    for (const needle of ["Niloy Rahman", "AIUB", "ChurnHedge", "SKILLS", "PROFESSIONAL SUMMARY"]) {
      expect(raw, `missing "${needle}" in PDF text layer`).toContain(needle);
    }
    // and it should NOT be built from a giant embedded PNG
    expect(raw.includes("/Subtype /Image")).toBe(false);
  });

  it("respects the user's section order", () => {
    const c = fixture();
    c.order = ["contact", "skills", "summary", "education", "experience", "projects"];
    const raw = buildResumePdf(new jsPDF({ unit: "pt", format: "a4" }), c).output() as string;
    expect(raw.indexOf("SKILLS")).toBeLessThan(raw.indexOf("PROFESSIONAL SUMMARY"));
  });

  it("paginates long content instead of clipping", () => {
    const c = fixture();
    c.projects = Array.from({ length: 20 }, (_, i) => ({
      name: `Project ${i}`,
      link: "",
      tech: "Python",
      bullets: [
        "Built a long pipeline handling 10,000 records daily with monitoring",
        "Reduced processing costs by 25% through batching and caching",
        "Shipped dashboards used by 4 teams for weekly reporting cycles",
      ],
    }));
    const doc = buildResumePdf(new jsPDF({ unit: "pt", format: "a4" }), c);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("handles an empty resume without throwing", () => {
    const doc = buildResumePdf(new jsPDF({ unit: "pt", format: "a4" }), emptyResumeContent());
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("derives a safe filename", () => {
    expect(resumeFileName(fixture())).toBe("Niloy_Rahman_resume.pdf");
    expect(resumeFileName(emptyResumeContent())).toBe("resume.pdf");
  });
});
