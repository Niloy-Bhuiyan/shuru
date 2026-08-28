/**
 * The CSP is only worth having if it says the specific things that make it
 * work. Each assertion below corresponds to a way the policy could be
 * "present" in a header dump while protecting nothing.
 */
import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/auth/csp";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

describe("buildCsp", () => {
  const prod = buildCsp(false);

  it("carries no nonce, which is what keeps the app running", () => {
    // A nonce in script-src makes browsers ignore 'unsafe-inline', and Next
    // 16's production build does not stamp nonces onto its own inline
    // scripts — so adding one blocks hydration (React #412). Measured; see
    // the header of csp.ts. This test exists to stop it being re-added
    // without re-measuring.
    const s = directive(prod, "script-src");
    expect(s).not.toContain("nonce-");
    expect(s).not.toContain("'strict-dynamic'");
    expect(s).toContain("'unsafe-inline'");
  });

  it("never allows eval in production", () => {
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    // Dev needs it for the HMR runtime; that must not leak into prod.
    expect(directive(buildCsp(true), "script-src")).toContain("'unsafe-eval'");
  });

  it("confines where a successful injection could send data", () => {
    // connect-src is what contains an XSS that does manage to run: it can
    // exfiltrate only to origins named here.
    const c = directive(prod, "connect-src");
    expect(c).toContain("'self'");
    expect(c).not.toContain("*");
    expect(c).not.toContain("https:");
  });

  it("locks the directives that have no legitimate use here", () => {
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("base-uri 'self'");
    // A hijacked form must not be able to POST credentials off-origin.
    expect(prod).toContain("form-action 'self'");
  });

  it("upgrades insecure requests only in production", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    expect(buildCsp(true)).not.toContain("upgrade-insecure-requests");
  });
});
