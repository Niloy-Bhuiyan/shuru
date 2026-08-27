/**
 * Server-side client for the Python retrieval service (services/rag).
 *
 * Server-only by construction: it carries SHURU_RAG_SERVICE_TOKEN, which must
 * never reach a browser. Nothing in `src/app/(main)` may import this — the
 * route handler at /api/ask is the only caller.
 *
 * The service answers questions about internship listings from the text those
 * listings actually publish, with a citation per claim. It abstains rather
 * than guessing, so "no answer" is a normal, meaningful response here and is
 * passed through to the UI intact rather than being smoothed into an error.
 */

export type RagCitation = {
  n: number;
  opportunity_id: string;
  company: string;
  role: string;
  source_field: string;
  chunk_index: number;
  source: string;
  apply_url: string | null;
  excerpt: string;
  distance: number;
  suspected_injection: boolean;
};

export type RagAnswer = {
  answer: string;
  abstained: boolean;
  abstain_reason: string | null;
  citations: RagCitation[];
  took_ms: number;
};

/** A value that is present and not an unfilled template placeholder. */
function isSet(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  return t !== "" && !/^(your|changeme|placeholder|xxx|<.*>)/i.test(t);
}

export function ragConfigured(): boolean {
  return (
    isSet(process.env.SHURU_RAG_URL) &&
    isSet(process.env.SHURU_RAG_SERVICE_TOKEN)
  );
}

/** Exact names of the variables still missing, for an operator-facing probe. */
export function ragMissingVars(): string[] {
  const missing: string[] = [];
  if (!isSet(process.env.SHURU_RAG_URL)) missing.push("SHURU_RAG_URL");
  if (!isSet(process.env.SHURU_RAG_SERVICE_TOKEN)) {
    missing.push("SHURU_RAG_SERVICE_TOKEN");
  }
  return missing;
}

export class RagUnavailableError extends Error {
  constructor(readonly detail: string) {
    super("rag_unavailable");
    this.name = "RagUnavailableError";
  }
}

/**
 * Bounded so a hung service cannot hold a serverless function open until the
 * platform kills it. Slightly above the Python side's own 30s request timeout
 * so its error surfaces instead of ours.
 */
const TIMEOUT_MS = 35_000;

export async function askRag(
  question: string,
  userId: string
): Promise<RagAnswer> {
  if (!ragConfigured()) {
    throw new RagUnavailableError(
      `not configured: ${ragMissingVars().join(", ")}`
    );
  }

  const base = process.env.SHURU_RAG_URL!.replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.SHURU_RAG_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ question, user_id: userId }),
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Pass the service's own structured reason through where it has one —
      // "daily_limit_reached" is actionable, "502" is not.
      throw new RagUnavailableError(
        typeof body?.error === "string" ? body.error : `http_${res.status}`
      );
    }

    return (await res.json()) as RagAnswer;
  } catch (e) {
    if (e instanceof RagUnavailableError) throw e;
    if ((e as Error).name === "AbortError") {
      throw new RagUnavailableError("timeout");
    }
    throw new RagUnavailableError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}
