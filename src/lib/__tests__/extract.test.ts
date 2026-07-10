import { describe, expect, it } from "vitest";
import { extractProfileHints, hasHints } from "@/lib/resume/extract";
import { emptyResumeContent } from "@/lib/types";

const profile = {
  skills: ["Python", "SQL"],
  has_deployed_project: false,
  cgpa: 3.4,
  department: "CSE",
};

describe("extractProfileHints", () => {
  it("finds new skills, deployment evidence and a differing CGPA", () => {
    const r = {
      ...emptyResumeContent(),
      summary: "Final year CSE student, CGPA 3.95/4.00",
      skills: ["Python", "PyTorch", "React"],
      projects: [
        {
          name: "App",
          link: "app.vercel.app",
          tech: "Next.js",
          bullets: ["Deployed the platform to Vercel for 200 users"],
        },
      ],
    };
    const h = extractProfileHints(r, profile);
    expect(h.newSkills).toContain("PyTorch");
    expect(h.newSkills).toContain("React");
    expect(h.newSkills).toContain("Next.js");
    expect(h.newSkills).not.toContain("Python"); // already on profile
    expect(h.deployedDetected).toBe(true);
    expect(h.cgpa).toBe(3.95);
    expect(h.department).toBeNull(); // same as profile
    expect(hasHints(h)).toBe(true);
  });

  it("never flips deployed true → false and ignores identical CGPA", () => {
    const r = {
      ...emptyResumeContent(),
      summary: "CGPA 3.40",
      skills: ["Python", "SQL"],
    };
    const h = extractProfileHints(r, { ...profile, has_deployed_project: true });
    expect(h.deployedDetected).toBe(false);
    expect(h.cgpa).toBeNull();
    expect(h.newSkills).toHaveLength(0);
    expect(hasHints(h)).toBe(false);
  });

  it("detects a department different from the profile", () => {
    const r = { ...emptyResumeContent(), summary: "BSc in SWE at AIUB" };
    const h = extractProfileHints(r, profile);
    expect(h.department).toBe("SWE");
  });
});
