/**
 * Route-classification guard for middleware.ts.
 *
 * These are the rules that decide where a signed-in user is allowed to be,
 * and getting one wrong produces a redirect loop or an unreachable screen
 * rather than a visible error. Two have already shipped broken:
 *
 *   - /onboarding was treated as public, so middleware bounced the very users
 *     who needed it back to /radar.
 *   - /reset-password was treated as public, so the "signed-in users have no
 *     business on a login form" rule bounced anyone arriving from a recovery
 *     link. A Supabase recovery link ESTABLISHES a session (updateUser needs
 *     one), so that user is always signed in — the password could never be
 *     changed. Reported from production.
 *
 * The lists are parsed out of the middleware source rather than imported:
 * importing middleware.ts pulls in next/server and @supabase/ssr, which is a
 * lot of machinery to stand up for what is really an assertion about four
 * arrays.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("src/middleware.ts", "utf8");

function listNamed(name: string): string[] {
  const m = SRC.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`${name} not found in middleware.ts`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const PUBLIC_ROUTES = listNamed("PUBLIC_ROUTES");
const SIGNED_IN_OK_ROUTES = listNamed("SIGNED_IN_OK_ROUTES");
const STUDENT_ROUTES = listNamed("STUDENT_ROUTES");

describe("middleware route classification", () => {
  it("never bounces a signed-in user away from the password reset form", () => {
    // Either of these makes the form reachable; both together is belt and
    // braces. What must never happen is it being public AND not exempt.
    const publicAndBounced =
      PUBLIC_ROUTES.includes("/reset-password") &&
      !SIGNED_IN_OK_ROUTES.includes("/reset-password");
    expect(
      publicAndBounced,
      "/reset-password is bounced for signed-in users, so a recovery link can never reach the form"
    ).toBe(false);
  });

  it("keeps /onboarding out of the public list", () => {
    // Listing it as public bounces a session-without-a-profile to /radar,
    // which is the one place that cannot help them.
    expect(PUBLIC_ROUTES).not.toContain("/onboarding");
    expect(STUDENT_ROUTES).toContain("/onboarding");
  });

  it("still bounces signed-in users off the sign-in surfaces", () => {
    for (const r of ["/login", "/register"]) {
      expect(PUBLIC_ROUTES).toContain(r);
      expect(SIGNED_IN_OK_ROUTES).not.toContain(r);
    }
  });

  it("exempts nothing that requires a session", () => {
    // An exemption only makes sense for a route that is reachable signed out.
    for (const r of SIGNED_IN_OK_ROUTES) {
      expect(
        STUDENT_ROUTES.includes(r),
        `${r} is exempt from the bounce but also requires auth`
      ).toBe(false);
    }
  });
});
