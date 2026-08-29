/**
 * THE EVIDENCE GATE.
 *
 * A model searching the web will return internships that do not exist, at
 * companies that do, with plausible deadlines. Nothing in a prompt prevents
 * that — it only reduces it. This module is what converts a lead into a
 * listing, and it does so the only way that actually settles the question:
 * **it fetches the URL and reads the page.**
 *
 * The rule is one line and it is not negotiable: a candidate whose URL does
 * not resolve, or whose page does not mention the company AND the role, is
 * DROPPED. Not downgraded, not flagged, not shown with a warning. Dropped.
 * ADR 0002 is the reason: a listing Shuru is unsure about must not exist,
 * because a student who applies to one that was never there has lost exactly
 * the thing this product claims to protect.
 *
 * ── What this can and cannot prove ────────────────────────────────────────
 *
 * It proves the page exists and is about this company and this role. It does
 * NOT prove the role is still open — a real URL for a posting that closed last
 * month resolves perfectly. That is why `deadline` stays null unless the
 * posting stated one, and why the existing expiry rules still apply. Claiming
 * more than the check supports would be the same failure in a new place.
 *
 * ── Why `fetchImpl` is injectable ─────────────────────────────────────────
 *
 * So the tests exercise every branch — timeout, redirect, 404, a page that
 * mentions the company but not the role — without touching the network. This
 * is the module whose failure modes matter most and whose behaviour is hardest
 * to observe in production, so it is the one that has to be exhaustively
 * testable.
 */

import type { ParsedCandidate } from "./parse";

/** Bounded: a discovery run must not hang on one slow careers page. */
const TIMEOUT_MS = 8_000;
/** Enough of the page to find a company and a role in; not a whole download. */
const MAX_BYTES = 400_000;

export type VerifiedCandidate = ParsedCandidate & {
  /** The URL after redirects — what a student will actually open. */
  resolved_url: string;
};

export type Rejection = {
  candidate: ParsedCandidate;
  reason:
    | "unreachable"
    | "http_error"
    | "not_html"
    | "company_not_found"
    | "role_not_found";
  detail?: string;
};

export type VerifyOutcome = {
  verified: VerifiedCandidate[];
  rejected: Rejection[];
};

type FetchImpl = typeof fetch;

/**
 * Normalise for comparison: case, punctuation and whitespace all differ
 * between what a model reports and what a page prints. "BRAC Bank Ltd." on the
 * page and "Brac Bank Limited" from the model should match on "brac bank".
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Strip tags and scripts so a match is against visible text, not markup. */
function visibleText(html: string): string {
  return normalise(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

/**
 * Legal-entity suffixes, dropped from a company name before matching.
 *
 * A model reports "BRAC Bank Ltd." and the page prints "BRAC Bank Limited";
 * neither string contains the other, so a strict match rejects a listing that
 * is perfectly real. These words carry no identifying information — the name
 * is what identifies the company — so removing them from the needle makes the
 * comparison about the part that matters.
 *
 * This does not loosen the check in any way that matters: "brac bank" still
 * has to appear on the page.
 */
const ENTITY_SUFFIXES = new Set([
  "ltd", "limited", "inc", "incorporated", "plc", "llc", "llp",
  "pvt", "private", "co", "corp", "corporation", "company", "gmbh", "bv", "sa",
]);

/**
 * Whether the page mentions `needle`.
 *
 * Full phrase first, then a token-subset fallback: a page titled "Software
 * Engineering Intern, Summer 2026" should satisfy a role of "Software Engineer
 * Intern". Very short tokens are dropped — matching on "of" or "a" would make
 * this check pass on anything.
 *
 * The fallback requires EVERY significant token to be present, not most. A
 * threshold like "half the words" is how "Marketing Intern" starts matching a
 * page about a marketing department.
 */
export function mentions(haystack: string, needle: string): boolean {
  const n = normalise(needle);
  if (!n) return false;
  if (haystack.includes(n)) return true;

  let tokens = n.split(" ").filter((t) => t.length >= 3);

  // Drop legal suffixes — but only if something identifying survives. A
  // needle of just "Limited" would otherwise become empty and match nothing,
  // which is the right answer for a different reason.
  const stripped = tokens.filter((t) => !ENTITY_SUFFIXES.has(t));
  if (stripped.length > 0) tokens = stripped;

  if (tokens.length === 0) return false;
  return tokens.every((t) => haystack.includes(t));
}

async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return await res.text();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= MAX_BYTES) break;
      }
    }
  } finally {
    // Abandoning a stream without cancelling leaks the socket on Node's
    // undici; discovery fetches up to eight of these per run.
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    merged.set(c.subarray(0, Math.min(c.length, total - at)), at);
    at += c.length;
    if (at >= total) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** Verify one candidate. Exported for the tests; the pipeline uses the plural. */
export async function verifyCandidate(
  candidate: ParsedCandidate,
  fetchImpl: FetchImpl = fetch
): Promise<{ ok: true; value: VerifiedCandidate } | { ok: false; rejection: Rejection }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchImpl(candidate.apply_url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify honestly. A careers page that blocks this is a page we do
        // not get to verify, and therefore a listing that does not ship.
        "user-agent": "ShuruBot/1.0 (+https://shuru-ten.vercel.app; listing verification)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (e) {
    return {
      ok: false,
      rejection: {
        candidate,
        reason: "unreachable",
        detail: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message,
      },
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return {
      ok: false,
      rejection: { candidate, reason: "http_error", detail: String(res.status) },
    };
  }

  const type = res.headers.get("content-type") ?? "";
  if (type && !type.includes("html") && !type.includes("text")) {
    return { ok: false, rejection: { candidate, reason: "not_html", detail: type } };
  }

  const text = visibleText(await readCapped(res));

  if (!mentions(text, candidate.company)) {
    return { ok: false, rejection: { candidate, reason: "company_not_found" } };
  }
  if (!mentions(text, candidate.role)) {
    return { ok: false, rejection: { candidate, reason: "role_not_found" } };
  }

  return {
    ok: true,
    value: { ...candidate, resolved_url: res.url || candidate.apply_url },
  };
}

/**
 * Verify every candidate, in parallel.
 *
 * Bounded by the caller's candidate limit (8), so this is at most eight
 * concurrent requests to eight different hosts — no pool worth building.
 *
 * Rejections are RETURNED, not swallowed. An operator seeing "6 found, 5
 * rejected: company_not_found" learns the model is inventing companies; an
 * operator seeing "1 listing" learns nothing and assumes the web is empty.
 */
export async function verifyCandidates(
  candidates: ParsedCandidate[],
  fetchImpl: FetchImpl = fetch
): Promise<VerifyOutcome> {
  const results = await Promise.all(
    candidates.map((c) => verifyCandidate(c, fetchImpl))
  );

  const verified: VerifiedCandidate[] = [];
  const rejected: Rejection[] = [];
  for (const r of results) {
    if (r.ok) verified.push(r.value);
    else rejected.push(r.rejection);
  }
  return { verified, rejected };
}
