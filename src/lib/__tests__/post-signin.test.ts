/**
 * Post-sign-in redirect target.
 *
 * `?next=` reaches this from middleware, but nothing stops someone mailing a
 * link with `?next=https://evil.example.com`. Sign-in is exactly the moment an
 * open redirect is most valuable to an attacker — the user has just proven
 * they trust the page.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { homeForRole, safeInternalPath } from "@/lib/auth/postSignIn";

describe("safeInternalPath", () => {
  it("keeps an ordinary internal path", () => {
    expect(safeInternalPath("/saved")).toBe("/saved");
    expect(safeInternalPath("/opportunity/abc")).toBe("/opportunity/abc");
  });

  it("keeps a path with a query string", () => {
    expect(safeInternalPath("/radar?filter=paid")).toBe("/radar?filter=paid");
  });

  it("falls back to /radar when absent", () => {
    expect(safeInternalPath(null)).toBe("/radar");
    expect(safeInternalPath(undefined)).toBe("/radar");
    expect(safeInternalPath("")).toBe("/radar");
  });

  it("refuses an absolute URL", () => {
    expect(safeInternalPath("https://evil.example.com/steal")).toBe("/radar");
    expect(safeInternalPath("http://evil.example.com")).toBe("/radar");
  });

  it("refuses a protocol-relative URL", () => {
    // "//evil.com" is the one that slips past a naive startsWith("/") check.
    expect(safeInternalPath("//evil.example.com/steal")).toBe("/radar");
  });

  it("refuses a scheme that is not http", () => {
    expect(safeInternalPath("javascript:alert(1)")).toBe("/radar");
    expect(safeInternalPath("data:text/html,<script>")).toBe("/radar");
  });

  it("matches the guard used by the OAuth callback", () => {
    // src/app/auth/callback/route.ts has the same rule. If one is loosened
    // and the other is not, the looser one is the hole.
    for (const probe of ["//x.com", "https://x.com", "", null]) {
      expect(safeInternalPath(probe)).toBe("/radar");
    }
  });
});

describe("homeForRole", () => {
  it("sends each role to its own workspace", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("employer")).toBe("/employer");
    expect(homeForRole("student")).toBe("/radar");
  });

  it("treats an unknown or missing role as a student", () => {
    // A missing user_roles row already reads as "student" server-side in
    // getSessionUser and client-side in useRole; landing must agree, and the
    // least-privileged destination is the safe default either way.
    expect(homeForRole(null)).toBe("/radar");
    expect(homeForRole(undefined)).toBe("/radar");
    expect(homeForRole("wat")).toBe("/radar");
  });
});

/**
 * Role-based landing has to hold on BOTH sign-in paths.
 *
 * It did not. The password form resolved its own destination with
 * `homeForRole`, so the rule looked implemented — but OAuth and email links go
 * through src/app/auth/callback/route.ts instead, which honoured whatever
 * `next` it was handed, and the sign-in buttons handed it a hardcoded
 * "/radar". An admin who signed in with Google therefore always landed on the
 * student feed, and since the operator entry points were removed from the
 * student app in 60546c0, /admin was unreachable through the UI entirely.
 *
 * Asserted against the source rather than by importing the route: the module
 * pulls in next/server and @supabase/ssr, which is a lot of machinery to stand
 * up in order to check that one function is consulted.
 */
describe("OAuth callback landing", () => {
  const ROUTE = readFileSync("src/app/auth/callback/route.ts", "utf8");

  it("consults homeForRole when no destination was requested", () => {
    expect(ROUTE).toContain("homeForRole");
    // The role lookup has to actually happen, not just be imported.
    expect(ROUTE).toMatch(/from\(\s*["']user_roles["']\s*\)/);
  });

  it("does not default a missing ?next= to a fixed route", () => {
    // This is the specific collapse that hid the bug: when "absent" and
    // "explicitly /radar" become the same value, the role can never decide.
    expect(ROUTE).not.toMatch(/if\s*\(!raw\)\s*return\s*["']\/radar["']/);
  });

  it("still refuses an off-origin destination", () => {
    // Loosening the open-redirect guard while fixing the landing would trade
    // one bug for a much worse one.
    expect(ROUTE).toContain('raw.startsWith("//")');
    expect(ROUTE).toContain('!raw.startsWith("/")');
  });
});

/**
 * The buttons must not pre-answer the question for the callback.
 */
describe("OAuth sign-in buttons", () => {
  const BUTTONS = readFileSync("src/components/auth/OAuthButtons.tsx", "utf8");

  it("omits ?next= entirely when nothing was requested", () => {
    expect(BUTTONS).not.toMatch(/next\s*=\s*["']\/radar["']/);
    expect(BUTTONS).toContain("/auth/callback`");
  });
});
