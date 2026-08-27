import { describe, expect, it } from "vitest";
import { bearerToken, presentedSecret, secretsMatch } from "@/lib/auth/secret";

/** Minimal stand-in for the parts of NextRequest the helpers read. */
function req(headers: Record<string, string>, query: Record<string, string> = {}) {
  return {
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    nextUrl: { searchParams: { get: (n: string) => query[n] ?? null } },
  };
}

describe("secretsMatch", () => {
  it("accepts the exact secret", () => {
    expect(secretsMatch("s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong secret of the same length", () => {
    expect(secretsMatch("s3creT", "s3cret")).toBe(false);
  });

  it("rejects a correct prefix", () => {
    expect(secretsMatch("s3cr", "s3cret")).toBe(false);
  });

  it("rejects a value that merely contains the secret", () => {
    expect(secretsMatch("xs3cretx", "s3cret")).toBe(false);
  });

  /**
   * The guard that matters most: an unset expectation must never be
   * satisfiable, or a deployment that forgot the variable would authenticate
   * every caller presenting "".
   */
  it("never matches when the expected secret is empty", () => {
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch("anything", "")).toBe(false);
  });

  it("handles non-ascii secrets without throwing on length mismatch", () => {
    expect(secretsMatch("পাসওয়ার্ড", "পাসওয়ার্ড")).toBe(true);
    expect(secretsMatch("a", "পাসওয়ার্ড")).toBe(false);
  });
});

describe("presentedSecret", () => {
  it("reads the header", () => {
    expect(presentedSecret(req({ "x-ingest-secret": "abc" }))).toBe("abc");
  });

  it("falls back to the query parameter", () => {
    expect(presentedSecret(req({}, { secret: "abc" }))).toBe("abc");
  });

  it("prefers the header over the query parameter", () => {
    // A query string lands in access logs; the header is the intended path,
    // so a request carrying both must not be authenticated by the weaker one.
    expect(presentedSecret(req({ "x-ingest-secret": "hdr" }, { secret: "qs" }))).toBe("hdr");
  });

  it("returns an empty string when neither is present", () => {
    expect(presentedSecret(req({}))).toBe("");
  });
});

describe("bearerToken", () => {
  it("extracts a bearer token", () => {
    expect(bearerToken(req({ authorization: "Bearer tok123" }))).toBe("tok123");
  });

  it("is case-insensitive on the scheme", () => {
    expect(bearerToken(req({ authorization: "bearer tok123" }))).toBe("tok123");
  });

  it("returns an empty string for a non-bearer scheme", () => {
    // Must not fall through to treating the whole header as the token.
    expect(bearerToken(req({ authorization: "Basic tok123" }))).toBe("");
  });

  it("returns an empty string when the header is absent", () => {
    expect(bearerToken(req({}))).toBe("");
  });
});
