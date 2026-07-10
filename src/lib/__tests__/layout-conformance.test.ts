/**
 * Regression guard for the one-frame layout decision: every page lives
 * inside the root layout's 430px max-w-app frame. No page may break out
 * with viewport-width tricks or reintroduce desktop-only breakpoints.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return pageFiles(p);
    return f.endsWith(".tsx") ? [p] : [];
  });
}

const files = pageFiles("src/app").concat(pageFiles("src/components"));

describe("layout conformance (430px frame)", () => {
  it("no page or component breaks out of the frame with w-screen", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src.includes("w-screen"), `${f} uses w-screen`).toBe(false);
      expect(src.includes("-translate-x-1/2 "), `${f} uses breakout translate`).toBe(false);
    }
  });

  it("no desktop-only lg: breakpoints (mobile-first stays mobile-first)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(/\blg:[a-z[-]/.test(src), `${f} uses lg: breakpoint`).toBe(false);
    }
  });
});
