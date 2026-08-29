/**
 * Turning a model's reply into candidates, without believing any of it.
 *
 * Two jobs, both defensive:
 *
 *  1. **Get JSON out of whatever came back.** The prompt forbids prose and
 *     fences; models produce both anyway, often only under load. A parser that
 *     assumes compliance turns an occasional stylistic lapse into "no
 *     internships found", which is the one answer this feature must never
 *     fake.
 *
 *  2. **Drop everything that cannot be checked.** A row with no company, no
 *     role, or no usable http(s) URL is discarded here rather than carried
 *     forward as a partial. Every survivor is still unverified — `verify.ts`
 *     is what decides whether the posting exists.
 *
 * Pure and synchronous on purpose: this is where malformed input is most
 * likely, and it is the cheapest place in the pipeline to test exhaustively.
 */

import type { DiscoveryCandidate } from "./prompt";

export type ParsedCandidate = DiscoveryCandidate;

const WORK_MODES = new Set(["onsite", "remote", "hybrid"]);

/** ISO calendar date, and a real one — 2026-02-31 is not a date. */
function asIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  // Round-trip check: Date accepts 2026-02-31 and silently rolls it to March.
  return dt.toISOString().slice(0, 10) === `${y}-${mo}-${d}` ? `${y}-${mo}-${d}` : null;
}

function asText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // Models emit the literal string "null" and "N/A" surprisingly often when
  // told a field is nullable. Both mean null and neither should be stored as
  // a value a student later reads.
  const low = t.toLowerCase();
  if (low === "null" || low === "n/a" || low === "none" || low === "unknown") {
    return null;
  }
  return t.slice(0, max);
}

/**
 * An absolute http(s) URL, or null.
 *
 * Anything else is refused, and the refusals matter: `javascript:` and `data:`
 * would be rendered into an anchor later, and a relative path cannot be
 * fetched server-side for verification. A URL that does not survive this is a
 * row that cannot be checked, which by the pipeline's rule is a row that does
 * not exist.
 */
export function asHttpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let url: URL;
  try {
    url = new URL(v.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  return url.toString();
}

/**
 * Extract the JSON object from a reply that may be wrapped in anything.
 *
 * Tries the whole string first, then a fenced block, then the widest
 * brace-delimited span. The last one is what survives a model that narrates
 * before and after the payload.
 */
export function extractJson(raw: string): unknown | null {
  const attempts: string[] = [raw.trim()];

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));

  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

export type ParseOutcome = {
  candidates: ParsedCandidate[];
  /** Rows the model returned that did not survive. Reported, never hidden. */
  dropped: number;
  /** True when nothing parseable came back at all — distinct from zero rows. */
  unparseable: boolean;
};

/**
 * Parse a discovery reply.
 *
 * `dropped` and `unparseable` are separate from an empty list because they
 * mean different things to an operator: zero candidates is a real answer
 * ("nothing matched"), while unparseable is a broken prompt or a provider
 * change, and a high drop count means the model is ignoring its rules. A
 * single `[]` return would collapse all three into "no internships found".
 */
export function parseDiscovery(raw: string, limit = 8): ParseOutcome {
  const json = extractJson(raw);
  if (!json || typeof json !== "object") {
    return { candidates: [], dropped: 0, unparseable: true };
  }

  const list = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(list)) {
    return { candidates: [], dropped: 0, unparseable: true };
  }

  const candidates: ParsedCandidate[] = [];
  let dropped = 0;

  for (const row of list) {
    if (!row || typeof row !== "object") {
      dropped++;
      continue;
    }
    const r = row as Record<string, unknown>;

    const company = asText(r.company, 200);
    const role = asText(r.role, 200);
    const apply_url = asHttpUrl(r.apply_url);

    // The three that cannot be null. Without any one of them the row is not a
    // listing, and without the URL it is not checkable.
    if (!company || !role || !apply_url) {
      dropped++;
      continue;
    }

    const work_mode = asText(r.work_mode, 20)?.toLowerCase() ?? null;

    candidates.push({
      company,
      role,
      apply_url,
      location: asText(r.location, 200),
      work_mode:
        work_mode && WORK_MODES.has(work_mode)
          ? (work_mode as ParsedCandidate["work_mode"])
          : null,
      deadline: asIsoDate(r.deadline),
      stipend_text: asText(r.stipend_text, 300),
      duration: asText(r.duration, 100),
      requirements: asText(r.requirements, 4000),
      description: asText(r.description, 8000),
    });

    if (candidates.length >= limit) break;
  }

  return { candidates, dropped, unparseable: false };
}
