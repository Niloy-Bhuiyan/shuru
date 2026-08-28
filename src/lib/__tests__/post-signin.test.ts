/**
 * Post-sign-in redirect target.
 *
 * `?next=` reaches this from middleware, but nothing stops someone mailing a
 * link with `?next=https://evil.example.com`. Sign-in is exactly the moment an
 * open redirect is most valuable to an attacker — the user has just proven
 * they trust the page.
 */
import { describe, expect, it } from "vitest";
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
