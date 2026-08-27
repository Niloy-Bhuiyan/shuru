import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared-secret comparison for the machine-to-machine endpoints (`/api/cron`,
 * `/api/ingest`, `/api/notifications/dispatch`).
 *
 * `a === b` on a secret returns as soon as two bytes differ, so the time it
 * takes leaks how much of a guess was correct. Comparing SHA-256 digests
 * instead means the comparison is always over 32 bytes regardless of what was
 * supplied, so neither the content nor the *length* of the real secret is
 * observable from timing.
 *
 * Node-only by construction (`node:crypto`); every caller already declares
 * `runtime = "nodejs"`.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  // An unset expectation can never be satisfied. Callers decide separately
  // whether a missing secret means "refuse" or "not required" — this function
  // only ever answers "did the caller present the right value".
  if (!expected) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * The secret a request presented, across the two shapes Shuru accepts.
 *
 * Header first: a query string is written to access logs and browser history,
 * so `?secret=` exists only for schedulers that cannot set headers.
 */
export function presentedSecret(req: {
  headers: { get(name: string): string | null };
  nextUrl: { searchParams: { get(name: string): string | null } };
}): string {
  return (
    req.headers.get("x-ingest-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    ""
  );
}

/**
 * The bearer token on an `Authorization` header, or "".
 *
 * Vercel Cron cannot attach custom headers; it sends `Authorization: Bearer
 * $CRON_SECRET`, which is why this shape is handled separately from
 * `presentedSecret`.
 */
export function bearerToken(req: {
  headers: { get(name: string): string | null };
}): string {
  const raw = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.*)$/i.exec(raw.trim());
  return m ? m[1] : "";
}
