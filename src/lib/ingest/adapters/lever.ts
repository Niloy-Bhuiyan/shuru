import { buildListing, matchesFilters, MAX_PER_SOURCE } from "../normalize";
import type { Opportunity, WorkMode } from "@/lib/types";
import { csv, type Adapter, type AdapterRunResult, type FetchLike } from "./types";

/**
 * Lever — https://api.lever.co/v0/postings/<slug>?mode=json
 *
 * Lever exposes each customer's board as public JSON; no key, no scraping.
 * Which boards to pull is a deployment decision, so the adapter is inactive
 * until LEVER_COMPANIES names at least one slug.
 */

/**
 * Timing, measured against a real board rather than guessed:
 * `api.lever.co/v0/postings/palantir?mode=json` returns 308 postings with full
 * descriptions and takes 33–79s. The original single unpaged request with an
 * 8s budget aborted every time and was reported as "unreachable boards:
 * palantir" — a live board misdiagnosed as dead.
 *
 * Paging fixes it: `limit=50` responds in ~9–10s. Each request gets a budget
 * with headroom over that, and the whole board gets an overall budget so one
 * slow customer cannot stall an ingestion run.
 */
const REQUEST_TIMEOUT_MS = 15_000;
const BOARD_BUDGET_MS = 45_000;
const PAGE_SIZE = 50;

export function leverUrl(slug: string, skip = 0, limit = PAGE_SIZE): string {
  return (
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}` +
    `?mode=json&limit=${limit}&skip=${skip}`
  );
}

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    team?: string;
    commitment?: string;
  };
  workplaceType?: string;
};

function workMode(raw: string | undefined): WorkMode {
  const v = (raw ?? "").toLowerCase();
  if (v === "remote") return "remote";
  if (v === "hybrid") return "hybrid";
  return "onsite";
}

/** Lever calls the company name only by its board slug, so that is the label. */
export function normalizeLever(
  raw: unknown,
  company: string,
  cap = MAX_PER_SOURCE
): Opportunity[] {
  if (!Array.isArray(raw)) return [];
  const out: Opportunity[] = [];
  for (const item of raw) {
    if (out.length >= cap) break;
    const p = item as LeverPosting;
    if (!p || typeof p.text !== "string") continue;

    const commitment = p.categories?.commitment ?? "";
    // commitment often carries "Intern"/"Internship" when the title does not
    if (!matchesFilters(p.text, [commitment, p.categories?.team ?? ""])) continue;

    const row = buildListing({
      source: "lever",
      sourceId: String(p.id ?? `${company}-${p.text}`),
      company,
      role: p.text,
      location: p.categories?.location ?? "",
      postedIso:
        typeof p.createdAt === "number"
          ? new Date(p.createdAt).toISOString()
          : new Date().toISOString(),
      // Lever's public feed carries no salary field
      paidEvidence: false,
      url: p.hostedUrl ?? p.applyUrl ?? null,
      workMode: workMode(p.workplaceType),
      description: p.descriptionPlain?.slice(0, 4000) ?? null,
    });
    if (row) out.push(row);
  }
  return out;
}

async function fetchPage(
  slug: string,
  skip: number,
  fetchImpl: FetchLike
): Promise<unknown[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(leverUrl(slug, skip), {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type BoardResult = {
  postings: unknown[];
  /** The first page failed — nothing was read from this board at all. */
  unreachable: boolean;
  /** Some pages were read, then the budget ran out. Not a failure. */
  truncated: boolean;
};

/**
 * Pages a board until it is exhausted or the budget runs out.
 *
 * `unreachable` and `truncated` are kept apart deliberately: a board that
 * returned 150 of 308 postings is a partial read worth reporting as such, not
 * the same event as one that never answered at all.
 */
async function fetchBoard(
  slug: string,
  fetchImpl: FetchLike
): Promise<BoardResult> {
  const startedAt = Date.now();
  const postings: unknown[] = [];

  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await fetchPage(slug, skip, fetchImpl);

    if (page === null) {
      // Failing on the very first page means the board gave us nothing.
      return { postings, unreachable: skip === 0, truncated: skip > 0 };
    }

    postings.push(...page);

    // A short page is the last page.
    if (page.length < PAGE_SIZE) {
      return { postings, unreachable: false, truncated: false };
    }
    if (Date.now() - startedAt > BOARD_BUDGET_MS) {
      return { postings, unreachable: false, truncated: true };
    }
  }
}

export const leverAdapter: Adapter = {
  source: "lever",

  isAvailable(env) {
    return csv(env.LEVER_COMPANIES).length > 0;
  },

  unavailableReason() {
    return "LEVER_COMPANIES is empty — no boards configured";
  },

  async run(fetchImpl, env): Promise<AdapterRunResult> {
    const slugs = csv(env.LEVER_COMPANIES);
    const listings: Opportunity[] = [];
    let fetched = 0;
    const unreachable: string[] = [];
    const truncated: string[] = [];

    // Per-board budget so one large board cannot crowd out the rest.
    const perBoard = Math.max(1, Math.floor(MAX_PER_SOURCE / slugs.length));

    for (const slug of slugs) {
      const board = await fetchBoard(slug, fetchImpl);
      if (board.unreachable) {
        unreachable.push(slug);
        continue;
      }
      if (board.truncated) truncated.push(slug);
      fetched += board.postings.length;
      listings.push(...normalizeLever(board.postings, slug, perBoard));
    }

    // Every board failing is a source failure; some failing is partial. A
    // truncated board is neither — it is a successful partial read, reported
    // so a shrinking board is visible rather than silently normal.
    const allFailed = unreachable.length === slugs.length;
    const notes = [
      unreachable.length ? `unreachable boards: ${unreachable.join(", ")}` : null,
      truncated.length
        ? `partially read (time budget): ${truncated.join(", ")}`
        : null,
    ].filter(Boolean);

    return {
      source: "lever",
      fetched: allFailed ? null : fetched,
      listings,
      error: notes.length ? notes.join("; ") : null,
    };
  },
};
