/**
 * LIVE WEB SEARCH — one narrow call, deliberately separate from `askAgent`.
 *
 * `askAgent` wires FUNCTION-CALLING tools: Shuru's own tools, executed by the
 * agent loop. This is a different thing — the provider's own server-side
 * search, which runs inside the provider and comes back as text. The two do
 * not compose well (Gemini's grounding tool and `functionDeclarations` are not
 * reliably accepted in the same request), and discovery needs no local tools at
 * all, so a second small function beats a flag on the first one.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Shuru's ingestion reaches boards with public APIs. No Bangladeshi board and
 * no major BD employer has one — the live corpus is 26 foreign listings and 1
 * hand-entered. A model that can search the live web is the only automated
 * route to the listings this product exists for. See ADR 0004.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * It does not decide anything. It returns whatever the model said, as text.
 * Every claim in that text is unverified and must be treated as a lead, not a
 * listing — `src/lib/discovery/verify.ts` is what turns one into the other by
 * fetching the URL. A caller that inserts this output directly has recreated
 * the exact failure ADR 0002 exists to prevent.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentNotConfiguredError } from "./adapter";

/** Bounded so one search cannot run up an unbounded bill. */
const MAX_SEARCHES = 5;

function geminiKey(): string | null {
  const k = process.env.GEMINI_API_KEY ?? "";
  if (!k || k.includes("YOUR_GEMINI_API_KEY")) return null;
  return k;
}

function anthropicKey(): string | null {
  const k = process.env.ANTHROPIC_API_KEY ?? "";
  if (!k || k.includes("YOUR_ANTHROPIC_API_KEY")) return null;
  return k;
}

/**
 * Whether live search is available on this deployment.
 *
 * Same keys as the agent, because it is the same providers. Kept as its own
 * predicate rather than reusing `agentEnabled()` so that a future deployment
 * could have one without the other and the UI would still be truthful.
 */
export function webSearchEnabled(): boolean {
  return anthropicKey() !== null || geminiKey() !== null;
}

export type SearchResult = {
  /** The model's answer. Unverified text; see the file header. */
  text: string;
  /** Which provider ran it — surfaced to operators, never used for logic. */
  provider: "anthropic" | "gemini";
};

/**
 * Run one grounded search turn.
 *
 * Throws `AgentNotConfiguredError` when no key is present, matching how the
 * rest of `src/lib/agent` behaves — a missing key is a configuration state the
 * UI hides, not an error a user should see.
 */
export async function searchWeb(
  prompt: string,
  opts: { system?: string; maxTokens?: number } = {}
): Promise<SearchResult> {
  const ak = anthropicKey();
  if (ak) return searchWithClaude(ak, prompt, opts);

  const gk = geminiKey();
  if (gk) return searchWithGemini(gk, prompt, opts);

  throw new AgentNotConfiguredError();
}

async function searchWithClaude(
  apiKey: string,
  prompt: string,
  opts: { system?: string; maxTokens?: number }
): Promise<SearchResult> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.system ? { system: opts.system } : {}),
    // A SERVER tool: Anthropic runs the search and the results never touch
    // this process. That is why there is no tool loop here — the reply is
    // already the post-search answer.
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_SEARCHES,
      } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: prompt }],
  });

  // Several text blocks come back when the model narrates between searches.
  // Joined rather than taking the first, or the JSON payload gets truncated.
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return { text, provider: "anthropic" };
}

async function searchWithGemini(
  apiKey: string,
  prompt: string,
  opts: { system?: string; maxTokens?: number }
): Promise<SearchResult> {
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Low, not zero. This is an extraction task dressed as a search; the
      // creativity that helps a chat answer is what invents a stipend here.
      temperature: 0.2,
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
    // Grounding. Deliberately the ONLY tool in the request — see the header.
    tools: [{ google_search: {} }],
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    // Surfaced verbatim to the caller, which reports it to an operator. A
    // swallowed provider error here looks identical to "no internships found",
    // which is the one outcome this feature must never fake.
    const detail = await res.text().catch(() => "");
    throw new Error(
      `gemini_search_failed:${res.status}:${detail.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("\n");

  return { text, provider: "gemini" };
}
