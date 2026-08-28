/**
 * Regression guard for the frame decision.
 *
 * Originally this banned `lg:` outright: the app was mobile-only, so any
 * desktop breakpoint was drift. The product now ships an intentional desktop
 * shell, so a blanket ban would be wrong — but the reason the guard existed
 * still holds. Desktop styling must stay a deliberate, reviewed decision in a
 * small set of shell files, not something that accumulates page by page until
 * two layouts are being maintained by accident.
 *
 * So `lg:` is allowed only in DESKTOP_SHELL below. Adding a file to that list
 * is the deliberate act; everything else stays mobile-first.
 *
 * The viewport-breakout ban is unchanged and applies everywhere: `w-screen`
 * escapes the frame at every width, desktop included.
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

/**
 * The only files permitted to carry desktop breakpoints. Paths are compared
 * with separators normalised, so this list works on Windows and POSIX alike.
 */
const DESKTOP_SHELL = [
  "src/app/layout.tsx", // frame widens from lg
  "src/app/(main)/layout.tsx", // sidebar + content columns
  "src/components/pixel/PixelNav.tsx", // hidden from lg
  "src/components/pixel/PixelSideNav.tsx", // shown from lg
  "src/app/(main)/radar/page.tsx", // feed becomes two columns
  // Fixed chrome: the launcher clears the mobile bottom nav, then drops to a
  // plain corner offset from lg where that nav no longer exists.
  "src/components/agent/AgentDock.tsx",
];

const normalise = (p: string) => p.replace(/\\/g, "/");

describe("layout conformance (430px frame)", () => {
  it("no page or component breaks out of the frame with w-screen", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src.includes("w-screen"), `${f} uses w-screen`).toBe(false);
      expect(src.includes("-translate-x-1/2 "), `${f} uses breakout translate`).toBe(false);
    }
  });

  it("confines desktop breakpoints to the shell files", () => {
    for (const f of files) {
      if (DESKTOP_SHELL.includes(normalise(f))) continue;
      const src = readFileSync(f, "utf8");
      expect(
        /\blg:[a-z[-]/.test(src),
        `${f} uses an lg: breakpoint but is not in DESKTOP_SHELL — add it there deliberately, or keep the file mobile-first`
      ).toBe(false);
    }
  });

  it("keeps the desktop shell list honest", () => {
    // A stale entry means the guard is protecting a file that no longer opts
    // in, which quietly widens what is allowed elsewhere.
    for (const listed of DESKTOP_SHELL) {
      const match = files.find((f) => normalise(f) === listed);
      expect(match, `${listed} is listed in DESKTOP_SHELL but does not exist`).toBeDefined();
      expect(
        /\blg:[a-z[-]/.test(readFileSync(match!, "utf8")),
        `${listed} is in DESKTOP_SHELL but uses no lg: breakpoint — remove it from the list`
      ).toBe(true);
    }
  });
});
