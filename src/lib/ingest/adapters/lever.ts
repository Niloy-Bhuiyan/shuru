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

const FETCH_TIMEOUT_MS = 8000;

export function leverUrl(slug: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
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

async function fetchBoard(
  slug: string,
  fetchImpl: FetchLike
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(leverUrl(slug), {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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
    const failures: string[] = [];

    // Per-board budget so one large board cannot crowd out the rest.
    const perBoard = Math.max(1, Math.floor(MAX_PER_SOURCE / slugs.length));

    for (const slug of slugs) {
      const raw = await fetchBoard(slug, fetchImpl);
      if (raw === null) {
        failures.push(slug);
        continue;
      }
      if (Array.isArray(raw)) fetched += raw.length;
      listings.push(...normalizeLever(raw, slug, perBoard));
    }

    // Every board failing is a source failure; some failing is partial.
    const allFailed = failures.length === slugs.length;
    return {
      source: "lever",
      fetched: allFailed ? null : fetched,
      listings,
      error: failures.length
        ? `unreachable boards: ${failures.join(", ")}`
        : null,
    };
  },
};
