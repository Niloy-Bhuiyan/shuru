import { beforeEach, describe, expect, it } from "vitest";
import { parseGeminiStreamChunk } from "@/lib/agent/gemini";
import { runAgentTurnStream, _resetAgentState } from "@/lib/agent/loop";
import type { AgentMessage, AgentResult, AskStreamFn, ToolCall } from "@/lib/agent/adapter";

beforeEach(() => _resetAgentState());

const ctx = { demoContext: { profile: null, applications: [], resume: null } };

/** Scripted streaming model: yields deltas, then RETURNS a result per turn. */
function fakeStream(script: { deltas: string[]; result: AgentResult }[]) {
  const seen: { messages: AgentMessage[]; tools: unknown[] }[] = [];
  let i = 0;
  const askStream: AskStreamFn = async function* (messages, tools) {
    seen.push({ messages: [...messages], tools });
    const step = script[Math.min(i++, script.length - 1)];
    for (const d of step.deltas) yield { type: "text", delta: d };
    return step.result;
  };
  return { askStream, seen };
}

describe("parseGeminiStreamChunk", () => {
  it("extracts incremental text", () => {
    expect(
      parseGeminiStreamChunk({ candidates: [{ content: { parts: [{ text: "Hi" }] } }] })
    ).toEqual({ text: "Hi", rawCalls: [] });
  });

  it("extracts function calls without ids (assigned later)", () => {
    expect(
      parseGeminiStreamChunk({
        candidates: [{ content: { parts: [{ functionCall: { name: "f", args: { a: 1 } } }] } }],
      })
    ).toEqual({ text: "", rawCalls: [{ name: "f", args: { a: 1 } }] });
  });

  it("survives an empty/blocked chunk", () => {
    expect(parseGeminiStreamChunk({})).toEqual({ text: "", rawCalls: [] });
  });
});

describe("runAgentTurnStream", () => {
  it("streams deltas for a direct answer and never touches tools", async () => {
    const { askStream } = fakeStream([
      { deltas: ["He", "llo ", "Niloy."], result: { toolCalls: [], finalText: "Hello Niloy." } },
    ]);
    const deltas: string[] = [];
    const r = await runAgentTurnStream({
      message: "hi",
      history: [],
      ctx,
      userKey: "t",
      lang: "en",
      askStream,
      exec: async () => {
        throw new Error("must not execute");
      },
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas.join("")).toBe("Hello Niloy.");
    expect(r.text).toBe("Hello Niloy.");
    expect(r.mutations).toHaveLength(0);
  });

  it("resets the streamed preamble on a tool round, then streams the answer", async () => {
    const call: ToolCall = {
      id: "c1",
      name: "update_application_status",
      input: { opportunity_id: "abc", status: "applied" },
    };
    const { askStream } = fakeStream([
      { deltas: ["let me check"], result: { toolCalls: [call], finalText: "let me check" } },
      { deltas: ["Tra", "cked."], result: { toolCalls: [], finalText: "Tracked." } },
    ]);
    let resets = 0;
    const muts: unknown[] = [];
    const deltas: string[] = [];
    const r = await runAgentTurnStream({
      message: "mark bkash applied",
      history: [],
      ctx,
      userKey: "t",
      lang: "en",
      askStream,
      exec: async () => ({
        result: '{"ok":true}',
        mutation: { type: "application_status", opportunity_id: "abc", status: "applied" },
      }),
      onDelta: (t) => deltas.push(t),
      onReset: () => resets++,
      onMutation: (m) => muts.push(m),
    });
    expect(resets).toBe(1);
    expect(muts).toHaveLength(1);
    expect(r.text).toBe("Tracked.");
    expect(r.mutations).toHaveLength(1);
  });

  it("forces a tools-off final answer when rounds are exhausted", async () => {
    const call: ToolCall = { id: "c", name: "get_user_profile", input: {} };
    const { askStream, seen } = fakeStream([
      { deltas: [""], result: { toolCalls: [call], finalText: "" } },
      { deltas: [""], result: { toolCalls: [call], finalText: "" } },
      { deltas: [""], result: { toolCalls: [call], finalText: "" } },
      { deltas: ["Final."], result: { toolCalls: [], finalText: "Final." } },
    ]);
    const r = await runAgentTurnStream({
      message: "loop",
      history: [],
      ctx,
      userKey: "t",
      lang: "en",
      askStream,
      exec: async () => ({ result: "{}" }),
      onDelta: () => {},
    });
    expect(r.text).toBe("Final.");
    expect(seen).toHaveLength(4);
    expect(seen[3].tools).toHaveLength(0); // final streamed call offered no tools
  });
});
