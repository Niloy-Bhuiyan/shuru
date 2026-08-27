/**
 * CLAUDE PROVIDER — translates the adapter's contract to the Anthropic
 * Messages API and back.
 *
 * The adapter contract (see adapter.ts) was designed Claude-first, so the
 * translation is close to a passthrough: `ToolDef` is already Anthropic's
 * `{ name, description, input_schema }` shape and goes across untouched.
 * The work is in the message shape — Shuru models a tool result as its own
 * role, while Anthropic carries tool results as blocks inside a *user* turn.
 *
 * Like gemini.ts, the translation functions here are pure and unit-tested;
 * only askClaude / askClaudeStream touch the network.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentMessage,
  AgentResult,
  AskOptions,
  StreamTextEvent,
  ToolCall,
  ToolDef,
} from "./adapter";

/**
 * Overridable so an operator can trade capability for cost without a code
 * change. The default is the current flagship: Shuru's answers are short, but
 * they are about someone's career prospects, and the whole product promise is
 * that it does not guess. Set ANTHROPIC_MODEL to a cheaper tier (for example
 * `claude-haiku-4-5`) if that trade is worth it for your deployment.
 *
 * Note for anyone updating this: current model ids carry no date suffix.
 */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

/**
 * Bounds a hung upstream connection. For the streaming variant this bounds
 * time-to-first-token; the SDK keeps reading once the stream is flowing.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Thinking is on by default on the current models and its tokens come out of
 * `max_tokens`. Shuru's turns are short and tool-driven, so a low effort
 * setting keeps latency and cost sane while leaving reasoning available.
 * `max_tokens` is floored well above the adapter's 1024 default for the same
 * reason — a budget that only covers thinking truncates the actual answer.
 */
const EFFORT = "low" as const;
const MIN_MAX_TOKENS = 4096;

// ── message translation ─────────────────────────────────────────────────

/**
 * Adapter messages → Anthropic messages.
 *
 * Two shape changes matter:
 *
 *  1. A `tool_result` is not a role in the Messages API. It is a block inside
 *     a user turn, and **consecutive tool results must be merged into one**
 *     user message — emitting one user turn per result reads as several
 *     separate human turns and degrades multi-turn tool use.
 *
 *  2. An assistant turn that requested tools carries its text and its
 *     `tool_use` blocks together in one content array.
 */
export function toAnthropicMessages(
  messages: AgentMessage[]
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }

    if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: c.id,
          name: c.name,
          input: c.input,
        });
      }
      // An assistant turn with neither text nor tool calls has nothing to
      // replay and would be rejected as empty content.
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }

    // tool_result → a block on a user turn, merged with any immediately
    // preceding tool results.
    const block: Anthropic.ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: m.tool_use_id,
      content: m.content,
    };
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.role === "user" &&
      Array.isArray(prev.content) &&
      prev.content.every(
        (b) => typeof b !== "string" && b.type === "tool_result"
      )
    ) {
      (prev.content as Anthropic.ContentBlockParam[]).push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  }

  return out;
}

/** Adapter tool definitions → Anthropic tools. Same shape; no translation. */
export function toAnthropicTools(tools: ToolDef[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Raised when the model declined the request outright.
 *
 * Surfaced rather than swallowed: Shuru's rule is that it never manufactures
 * an answer, and silently returning empty text would read to the caller as
 * "the model had nothing to say" instead of "the model refused".
 */
export class ClaudeRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`claude_refused${category ? `_${category}` : ""}`);
    this.name = "ClaudeRefusalError";
  }
}

/** Anthropic response content → the adapter's AgentResult. */
export function parseAnthropicResponse(msg: Anthropic.Message): AgentResult {
  // `stop_details` is populated only on a refusal — guard before reading it.
  if (msg.stop_reason === "refusal") {
    throw new ClaudeRefusalError(msg.stop_details?.category ?? null);
  }

  const toolCalls: ToolCall[] = [];
  const texts: string[] = [];

  for (const block of msg.content) {
    if (block.type === "text") {
      texts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        // Always the parsed object — never string-match a serialized input.
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
    // `thinking` blocks are deliberately dropped: the adapter contract has no
    // place for them, and Shuru never shows model reasoning as if it were
    // evidence.
  }

  return { toolCalls, finalText: texts.join("").trim() };
}

// ── network ─────────────────────────────────────────────────────────────

function client(key: string): Anthropic {
  return new Anthropic({ apiKey: key, timeout: REQUEST_TIMEOUT_MS });
}

function requestBody(
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions
) {
  return {
    model: MODEL,
    max_tokens: Math.max(opts.maxTokens ?? MIN_MAX_TOKENS, MIN_MAX_TOKENS),
    output_config: { effort: EFFORT },
    ...(opts.system ? { system: opts.system } : {}),
    messages: toAnthropicMessages(messages),
    ...(tools.length ? { tools: toAnthropicTools(tools) } : {}),
  };
}

/** Translate a provider failure into a stable, non-leaking error. */
function upstream(e: unknown, call: string): Error {
  if (e instanceof Anthropic.APIError) {
    // The provider's own message can quote the prompt back; log it server
    // side, but give the caller a stable code with nothing user-derived.
    console.error(
      `[claude] ${MODEL} ${call} failed ${e.status}: ${String(e.message).slice(0, 500)}`
    );
    return new Error(`claude_upstream_${e.status ?? "error"}`);
  }
  return e instanceof Error ? e : new Error(String(e));
}

/** One model turn. Stateless, like every other provider here. */
export async function askClaude(
  key: string,
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions
): Promise<AgentResult> {
  try {
    const msg = await client(key).messages.create(
      requestBody(messages, tools, opts)
    );
    return parseAnthropicResponse(msg);
  } catch (e) {
    if (e instanceof ClaudeRefusalError) throw e;
    throw upstream(e, "messages.create");
  }
}

/**
 * Streaming variant — yields text deltas, returns the completed turn.
 *
 * `finalMessage()` is the SDK's own accumulator; reimplementing it from raw
 * events is how tool-call blocks get dropped.
 */
export async function* askClaudeStream(
  key: string,
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions
): AsyncGenerator<StreamTextEvent, AgentResult, void> {
  try {
    const stream = client(key).messages.stream(
      requestBody(messages, tools, opts)
    );
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", delta: event.delta.text };
      }
    }
    return parseAnthropicResponse(await stream.finalMessage());
  } catch (e) {
    if (e instanceof ClaudeRefusalError) throw e;
    throw upstream(e, "messages.stream");
  }
}
