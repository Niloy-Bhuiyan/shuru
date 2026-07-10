/**
 * AGENT ADAPTER — the ONLY place in the codebase that talks to an LLM.
 *
 * Everything (agent chat, Explain This, Forge rewrites) calls askAgent();
 * nothing else may import a provider SDK or hit a provider URL. Tool
 * definitions use Anthropic's Messages-API shape verbatim (name /
 * description / input_schema JSON Schema): gemini.ts translates that shape
 * to Gemini functionDeclarations today, and a future claude.ts is a
 * near-passthrough — swap providers by setting a key, not by refactoring.
 *
 * askAgent is ONE MODEL TURN, stateless. The agent loop (execute tools,
 * feed results back, re-ask) lives in /api/agent — providers stay dumb
 * translators, and cost controls have a single throat to choke.
 */

import { askGemini, askGeminiStream } from "./gemini";

export type ToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolCall = {
  /** echoed back on the matching tool_result */
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Provider-opaque signature for the model's reasoning behind this call.
   *  Gemini 2.5+ returns a `thoughtSignature` per functionCall that MUST be
   *  echoed back on the assistant turn, or multi-turn tool use 400s
   *  ("Function call is missing a thought_signature"). Empty for providers
   *  that don't use it. */
  signature?: string;
};

export type AgentMessage =
  | {
      role: "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      /** present when this assistant turn requested tools — the loop in
       *  /api/agent records it so providers can reconstruct the exchange */
      toolCalls?: ToolCall[];
    }
  | {
      role: "tool_result";
      tool_use_id: string;
      name: string;
      content: string;
    };

export type AgentResult = {
  /** non-empty ⇒ caller executes these server-side and asks again */
  toolCalls: ToolCall[];
  /** non-empty ⇒ the model answered; the turn is complete */
  finalText: string;
};

/** A single streamed text delta from the provider. */
export type StreamTextEvent = { type: "text"; delta: string };

/** One streamed model turn: yields text deltas, RETURNS the final result
 *  (accumulated text + any tool calls) when the turn completes. */
export type AskStreamFn = (
  messages: AgentMessage[],
  tools: ToolDef[],
  opts?: AskOptions
) => AsyncGenerator<StreamTextEvent, AgentResult, void>;

export type AskOptions = {
  system?: string;
  maxTokens?: number;
  /** sampling temperature; defaults per provider (Gemini: 0.4) */
  temperature?: number;
};

export class AgentNotConfiguredError extends Error {
  constructor() {
    super("No LLM provider configured");
    this.name = "AgentNotConfiguredError";
  }
}

function geminiKey(): string | null {
  const k = process.env.GEMINI_API_KEY ?? "";
  if (!k || k.includes("YOUR_GEMINI_API_KEY")) return null;
  return k;
}

// ── FUTURE: Claude plug-in point ─────────────────────────────────────
// function anthropicKey(): string | null {
//   const k = process.env.ANTHROPIC_API_KEY ?? "";
//   if (!k || k.includes("YOUR_ANTHROPIC_API_KEY")) return null;
//   return k;
// }

/** True iff any provider key is configured — used by GET probes and by
 *  the UI (via those probes) to hide AI entry points gracefully. */
export function agentEnabled(): boolean {
  // return anthropicKey() !== null || geminiKey() !== null;  ← with claude.ts
  return geminiKey() !== null;
}

export async function askAgent(
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions = {}
): Promise<AgentResult> {
  // ── FUTURE: Claude preferred when configured ───────────────────────
  // const ak = anthropicKey();
  // if (ak) return askClaude(ak, messages, tools, opts);   // see claude.ts

  const gk = geminiKey();
  if (!gk) throw new AgentNotConfiguredError();
  return askGemini(gk, messages, tools, opts);
}

/** Streaming variant of askAgent — same provider selection, streams deltas.
 *  Callers should fall back to askAgent if this throws. */
export function askAgentStream(
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions = {}
): AsyncGenerator<StreamTextEvent, AgentResult, void> {
  const gk = geminiKey();
  if (!gk) throw new AgentNotConfiguredError();
  return askGeminiStream(gk, messages, tools, opts);
}
