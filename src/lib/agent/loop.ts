/**
 * AGENT LOOP — one user turn, end to end: ask the model, execute any tool
 * calls server-side, feed results back, repeat (bounded), return the final
 * answer + any client mutations. Lives outside the route file so it's
 * unit-testable with an injected model/executor.
 *
 * COST CONTROLS (free-tier discipline):
 *  - History capped to the last MAX_HISTORY chat turns; tool exchanges
 *    never persist across requests (also keeps provider payloads valid —
 *    a tool_result without its assistant tool-call turn is malformed).
 *  - get_reality_check cached per (user, opportunity) for CACHE_TTL_MS —
 *    the model loves re-checking the same listing mid-conversation.
 *  - Soft rate limit: MAX_PER_DAY messages per user per UTC day. In-memory,
 *    so a serverless cold start resets it — acceptable for a free tier;
 *    it's a cost seatbelt, not a security boundary.
 *  - Bounded loop: MAX_ROUNDS tool rounds, MAX_CALLS_PER_ROUND executions,
 *    then one final tools-off call so the user always gets an answer.
 *
 * Two runners share the loop: runAgentTurn (buffered, returns full text) and
 * runAgentTurnStream (streams text deltas as they arrive from the provider,
 * for the magical chat). Both resolve tools identically via resolveCall.
 */

import { askAgent, askAgentStream, type AgentMessage } from "./adapter";
import {
  executeTool,
  TOOL_DEFS,
  type ClientMutation,
  type ToolContext,
  type ToolExecution,
} from "./tools";
import type { AgentResult, AskStreamFn, ToolCall, ToolDef } from "./adapter";

export const MAX_HISTORY = 6;
export const MAX_PER_DAY = 20;
const MAX_ROUNDS = 3;
const MAX_CALLS_PER_ROUND = 3;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 200;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function capHistory(raw: unknown, max = MAX_HISTORY): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is ChatTurn =>
        typeof m === "object" &&
        m !== null &&
        ((m as ChatTurn).role === "user" || (m as ChatTurn).role === "assistant") &&
        typeof (m as ChatTurn).content === "string"
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    .slice(-max);
}

// ── soft rate limit ──
const dayCounts = new Map<string, { day: string; count: number }>();
const RATE_KEYS_MAX = 10000; // hard cap against a same-day flood of distinct keys
let lastSweepDay = "";

export function checkRateLimit(userKey: string): { ok: boolean; remaining: number } {
  const day = new Date().toISOString().slice(0, 10);
  // Once per UTC day, drop prior-day entries so the map can't grow unbounded
  // (previously entries accumulated forever — see ISSUES.md).
  if (day !== lastSweepDay) {
    lastSweepDay = day;
    dayCounts.forEach((v, k) => {
      if (v.day !== day) dayCounts.delete(k);
    });
  }
  const entry = dayCounts.get(userKey);
  if (!entry || entry.day !== day) {
    if (dayCounts.size >= RATE_KEYS_MAX) {
      const oldest = dayCounts.keys().next().value;
      if (oldest !== undefined) dayCounts.delete(oldest);
    }
    dayCounts.set(userKey, { day, count: 1 });
    return { ok: true, remaining: MAX_PER_DAY - 1 };
  }
  if (entry.count >= MAX_PER_DAY) return { ok: false, remaining: 0 };
  entry.count += 1;
  return { ok: true, remaining: MAX_PER_DAY - entry.count };
}

// ── reality-check cache ──
const rcCache = new Map<string, { at: number; exec: ToolExecution }>();

function cacheKey(userKey: string, call: ToolCall): string | null {
  if (call.name !== "get_reality_check") return null;
  const id = call.input.opportunity_id;
  return typeof id === "string" ? `${userKey}:${id}` : null;
}

/** Execute one tool call, honoring the per-(user,opportunity) reality-check
 *  cache. Shared by the buffered and streaming runners so they can never
 *  diverge in tool semantics. */
async function resolveCall(
  call: ToolCall,
  ctx: ToolContext,
  userKey: string,
  exec: typeof executeTool
): Promise<ToolExecution> {
  const key = cacheKey(userKey, call);
  const hit = key ? rcCache.get(key) : undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.exec;
  const execution = await exec(call, ctx);
  if (key) {
    if (rcCache.size >= CACHE_MAX) {
      const oldest = rcCache.keys().next().value;
      if (oldest !== undefined) rcCache.delete(oldest);
    }
    rcCache.set(key, { at: Date.now(), exec: execution });
  }
  return execution;
}

/** The system prompt — the honesty contract. Shared by both runners. */
export function buildSystemPrompt(lang: "en" | "bn", today: string): string {
  return [
    `You are Shuru's agent — an honest internship copilot for Bangladeshi university students. Today is ${today}.`,
    `Use the tools for ANY factual claim about listings, the user's profile, their odds, their tracker, or their resume. Never invent listings, numbers, deadlines or odds.`,
    `Odds come only from get_reality_check. If it abstains, say plainly that there isn't enough data for an honest number — that honesty is the product.`,
    `Only call update_application_status when the user explicitly asks to track or update an application.`,
    `Be concise: 2–6 short sentences, plain text, no markdown headings or bullet lists. Warm, direct, zero hype.`,
    lang === "bn" ? `Reply in Bangla.` : `Reply in English.`,
  ].join("\n");
}

/** test hook — clears both in-memory stores */
export function _resetAgentState() {
  dayCounts.clear();
  rcCache.clear();
  lastSweepDay = "";
}

export type AgentTurnResult = {
  text: string;
  mutations: ClientMutation[];
};

export async function runAgentTurn(opts: {
  message: string;
  history: ChatTurn[];
  ctx: ToolContext;
  userKey: string;
  lang: "en" | "bn";
  /** injectable for tests */
  ask?: typeof askAgent;
  exec?: typeof executeTool;
  now?: () => Date;
}): Promise<AgentTurnResult> {
  const ask = opts.ask ?? askAgent;
  const exec = opts.exec ?? executeTool;
  const today = (opts.now?.() ?? new Date()).toISOString().slice(0, 10);
  const system = buildSystemPrompt(opts.lang, today);

  const messages: AgentMessage[] = [
    ...opts.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: opts.message },
  ];
  const mutations: ClientMutation[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await ask(messages, TOOL_DEFS, { system, maxTokens: 700 });
    if (res.toolCalls.length === 0) {
      return { text: res.finalText, mutations };
    }

    const calls = res.toolCalls.slice(0, MAX_CALLS_PER_ROUND);
    messages.push({ role: "assistant", content: res.finalText, toolCalls: calls });

    for (const call of calls) {
      const execution = await resolveCall(call, opts.ctx, opts.userKey, exec);
      if (execution.mutation) mutations.push(execution.mutation);
      messages.push({
        role: "tool_result",
        tool_use_id: call.id,
        name: call.name,
        content: execution.result,
      });
    }
  }

  // rounds exhausted — force a final answer with tools off
  const final = await ask(messages, [], {
    system: system + `\nAnswer NOW from the tool results above; no more tool calls.`,
    maxTokens: 700,
  });
  return { text: final.finalText, mutations };
}

/**
 * Streaming runner. Identical loop, but each model turn streams text deltas
 * to onDelta as they arrive. Because a turn that ends in tool calls may have
 * streamed a short preamble, onReset fires before tools run so the client can
 * discard that draft — the real answer streams on a later turn. onMutation
 * fires the moment a mutation is produced so the UI can apply it immediately.
 */
export async function runAgentTurnStream(opts: {
  message: string;
  history: ChatTurn[];
  ctx: ToolContext;
  userKey: string;
  lang: "en" | "bn";
  onDelta: (text: string) => void;
  onReset?: () => void;
  onMutation?: (m: ClientMutation) => void;
  /** injectable for tests */
  askStream?: AskStreamFn;
  exec?: typeof executeTool;
  now?: () => Date;
}): Promise<AgentTurnResult> {
  const askStream = opts.askStream ?? askAgentStream;
  const exec = opts.exec ?? executeTool;
  const today = (opts.now?.() ?? new Date()).toISOString().slice(0, 10);
  const system = buildSystemPrompt(opts.lang, today);

  const messages: AgentMessage[] = [
    ...opts.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: opts.message },
  ];
  const mutations: ClientMutation[] = [];

  async function streamTurn(tools: ToolDef[], sys: string): Promise<AgentResult> {
    const gen = askStream(messages, tools, { system: sys, maxTokens: 700 });
    let result: AgentResult = { toolCalls: [], finalText: "" };
    // Manual iteration so we can capture the generator's RETURN value.
    for (;;) {
      const step = await gen.next();
      if (step.done) {
        result = step.value ?? result;
        break;
      }
      if (step.value.type === "text" && step.value.delta) {
        opts.onDelta(step.value.delta);
      }
    }
    return result;
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await streamTurn(TOOL_DEFS, system);
    if (res.toolCalls.length === 0) {
      return { text: res.finalText, mutations };
    }
    // This turn calls tools — any preamble we streamed is not the answer.
    opts.onReset?.();

    const calls = res.toolCalls.slice(0, MAX_CALLS_PER_ROUND);
    messages.push({ role: "assistant", content: res.finalText, toolCalls: calls });

    for (const call of calls) {
      const execution = await resolveCall(call, opts.ctx, opts.userKey, exec);
      if (execution.mutation) {
        mutations.push(execution.mutation);
        opts.onMutation?.(execution.mutation);
      }
      messages.push({
        role: "tool_result",
        tool_use_id: call.id,
        name: call.name,
        content: execution.result,
      });
    }
  }

  const final = await streamTurn(
    [],
    system + `\nAnswer NOW from the tool results above; no more tool calls.`
  );
  return { text: final.finalText, mutations };
}
