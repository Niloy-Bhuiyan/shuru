import { describe, expect, it } from "vitest";
import { jdMatch, tokenize } from "@/lib/resume/jdMatch";
import { emptyResumeContent } from "@/lib/types";

const resume = {
  ...emptyResumeContent(),
  summary: "CSE student building with Python and PyTorch",
  skills: ["Python", "SQL", "React"],
  projects: [
    {
      name: "Detector",
      link: "",
      tech: "PyTorch, OpenCV",
      bullets: ["Built a CNN classifier with 95% accuracy"],
    },
  ],
};

describe("tokenize", () => {
  it("keeps tech tokens like c++, node.js, yolov8 and drops stopwords", () => {
    const toks = tokenize("Experience with C++ and Node.js required; YOLOv8 a plus for the team");
    expect(toks).toContain("c++");
    expect(toks).toContain("node.js");
    expect(toks).toContain("yolov8");
    expect(toks).not.toContain("the");
    expect(toks).not.toContain("experience");
  });
});

describe("jdMatch", () => {
  it("returns null for an empty JD", () => {
    expect(jdMatch(resume, "   ")).toBeNull();
  });

  it("finds matches and gaps with a sane percent", () => {
    const jd =
      "We need Python, PyTorch and Docker. Kubernetes is preferred. SQL required. React for dashboards.";
    const r = jdMatch(resume, jd)!;
    expect(r.matched).toContain("python");
    expect(r.matched).toContain("pytorch");
    expect(r.matched).toContain("sql");
    expect(r.missing).toContain("docker");
    expect(r.missing).toContain("kubernetes");
    expect(r.percent).toBeGreaterThan(30);
    expect(r.percent).toBeLessThan(100);
  });

  it("is 100% when the resume covers every JD keyword", () => {
    const r = jdMatch(resume, "python sql react pytorch")!;
    expect(r.percent).toBe(100);
    expect(r.missing).toHaveLength(0);
  });
});
