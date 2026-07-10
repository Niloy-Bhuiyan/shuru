/**
 * GEMINI PROVIDER — translates the adapter's Claude-shaped contract to
 * Gemini's v1beta REST function-calling and back. Free tier, key
 * server-side only. The translation functions are pure and unit-tested;
 * only askGemini() touches the network.
 */

import type {
  AgentMessage,
  AgentResult,
  AskOptions,
  ToolCall,
  ToolDef,
} from "./adapter";

// Model is overridable via GEMINI_MODEL so you can switch without code edits.
// Default to the rolling "latest flash-lite" alias: it never goes stale (pinned
// versions like gemini-2.5-flash get retired for new keys → "no longer available
// to new users" 404s), it's fast (~1.5s vs ~27s for the thinking-enabled
// gemini-flash-latest, which burns this app's small token budget on reasoning),
// and it's the cheapest tier — ideal for the short, honest outputs here.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

// Guard against a hung upstream connection. For streaming this bounds the time
// to first byte (connect/headers), then the timer is cleared so a legitimately
// long token stream is never cut off mid-answer.
const REQUEST_TIMEOUT_MS = 30000;

// ── schema translation: JSON Schema → Gemini parameters ──
// Gemini's v1beta REST examples use UPPERCASE type names; uppercase them
// recursively and drop JSON-Schema keys Gemini rejects.
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "additionalProperties" || k === "$schema" || k === "default") continue;
    if (k === "type" && typeof v === "string") {
      out[k] = v.toUpperCase();
    } else {
      out[k] = toGeminiSchema(v);
    }
  }
  return out;
}

type GeminiPart =
  | { text: string }
  | {
      functionCall: { name: string; args: Record<string, unknown> };
      // Must be echoed back verbatim on the model turn for Gemini 2.5+ tool use.
      thoughtSignature?: string;
    }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: "user" | "model" | "function"; parts: GeminiPart[] };

export function toGeminiContents(messages: AgentMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        // Echo the thoughtSignature back on the functionCall part — required
        // by Gemini 2.5+ for the follow-up turn after tool results.
        parts.push(
          c.signature
            ? { functionCall: { name: c.name, args: c.input }, thoughtSignature: c.signature }
            : { functionCall: { name: c.name, args: c.input } }
        );
      }
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      // tool_result → functionResponse (response must be an object)
      contents.push({
        role: "function",
        parts: [
          {
            functionResponse: {
              name: m.name,
              response: { result: m.content },
            },
          },
        ],
      });
    }
  }
  return contents;
}

export function toGeminiBody(
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 1024,
    },
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }
  if (tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: toGeminiSchema(t.input_schema),
        })),
      },
    ];
  }
  return body;
}

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        functionCall?: { name: string; args?: Record<string, unknown> };
        thoughtSignature?: string;
      }[];
    };
  }[];
};

export function parseGeminiResponse(data: GeminiResponse): AgentResult {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const toolCalls: ToolCall[] = [];
  const texts: string[] = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      toolCalls.push({
        id: `call_${toolCalls.length}_${p.functionCall.name}`,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
        signature: p.thoughtSignature,
      });
    } else if (p.text) {
      texts.push(p.text);
    }
  }
  return { toolCalls, finalText: texts.join("").trim() };
}

export async function askGemini(
  key: string,
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions
): Promise<AgentResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(toGeminiBody(messages, tools, opts)),
        signal: ctrl.signal,
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[gemini] ${MODEL} generateContent failed ${res.status}: ${detail.slice(0, 500)}`);
      throw new Error(`gemini_upstream_${res.status}`);
    }
    return parseGeminiResponse((await res.json()) as GeminiResponse);
  } finally {
    clearTimeout(timer);
  }
}

// ── streaming ──────────────────────────────────────────────────────
// One SSE chunk (a partial GenerateContentResponse) → its text + raw calls.
// Pure and unit-tested; ids are assigned by the generator so they stay
// stable across the whole stream, not per-chunk.
export function parseGeminiStreamChunk(data: GeminiResponse): {
  text: string;
  rawCalls: { name: string; args: Record<string, unknown>; signature?: string }[];
} {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  const rawCalls: { name: string; args: Record<string, unknown>; signature?: string }[] = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      rawCalls.push({
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
        signature: p.thoughtSignature,
      });
    } else if (p.text) {
      text += p.text;
    }
  }
  return { text, rawCalls };
}

export async function* askGeminiStream(
  key: string,
  messages: AgentMessage[],
  tools: ToolDef[],
  opts: AskOptions
): AsyncGenerator<{ type: "text"; delta: string }, AgentResult, void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(toGeminiBody(messages, tools, opts)),
        signal: ctrl.signal,
      }
    );
  } finally {
    // Response headers are in (or the fetch failed) — stop the connect timer so
    // a long, healthy token stream below is never aborted mid-answer.
    clearTimeout(timer);
  }
  if (!res.ok || !res.body) {
    const detail = res.ok ? "no response body" : await res.text().catch(() => "");
    console.error(`[gemini] ${MODEL} streamGenerateContent failed ${res.status}: ${String(detail).slice(0, 500)}`);
    throw new Error(`gemini_stream_${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  const toolCalls: ToolCall[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = rawEvent
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      let parsed: GeminiResponse;
      try {
        parsed = JSON.parse(json) as GeminiResponse;
      } catch {
        continue; // ignore malformed keep-alive / partial lines
      }
      const { text, rawCalls } = parseGeminiStreamChunk(parsed);
      if (text) {
        full += text;
        yield { type: "text", delta: text };
      }
      for (const rc of rawCalls) {
        toolCalls.push({
          id: `call_${toolCalls.length}_${rc.name}`,
          name: rc.name,
          input: rc.args ?? {},
          signature: rc.signature,
        });
      }
    }
  }

  return { toolCalls, finalText: full.trim() };
}
