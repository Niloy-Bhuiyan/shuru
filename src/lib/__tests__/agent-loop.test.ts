import { beforeEach, describe, expect, it } from "vitest";
import {
  capHistory,
  checkRateLimit,
  MAX_PER_DAY,
  runAgentTurn,
  _resetAgentState,
} from "@/lib/agent/loop";
import type { AgentMessage, AgentResult, ToolDef } from "@/lib/agent/adapter";
import type { ToolCall } from "@/lib/agent/adapter";

beforeEach(() => _resetAgentState());

const ctx = { demoContext: { profile: null, applications: [], resume: null } };

function fakeAsk(script: AgentResult[]) {
  const seen: { messages: AgentMessage[]; tools: ToolDef[]; system?: string }[] = [];
  let i = 0;
  const ask = async (
    messages: AgentMessage[],
    tools: ToolDef[],
    opts?: { system?: string }
  ): Promise<AgentResult> => {
    seen.push({ messages: [...messages], tools, system: opts?.system });
    return script[Math.min(i++, script.length - 1)];
  };
  return { ask, seen };
}

describe("capHistory", () => {
  it("keeps only the last 6 valid turns and truncates long content", () => {
    const raw = [
      { role: "tool_result", content: "x" }, // invalid role → dropped
      ...Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `m${i}` })),
      { role: "assistant", content: "y".repeat(5000) },
    ];
    const capped = capHistory(raw);
    expect(capped).toHaveLength(6);
    expect(capped[0].content).toBe("m5");
    expect(capped[5].content.length).toBe(1500);
  });

  it("returns [] for garbage input", () => {
    expect(capHistory("nope")).toEqual([]);
    expect(capHistory(null)).toEqual([]);
  });
});

describe("checkRateLimit", () => {
  it("allows exactly MAX_PER_DAY then blocks", () => {
    for (let i = 0; i < MAX_PER_DAY; i++) {
      expect(checkRateLimit("u1").ok).toBe(true);
    }
    const blocked = checkRateLimit("u1");
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(checkRateLimit("u2").ok).toBe(true); // independent keys
  });
});

describe("runAgentTurn", () => {
  it("returns a direct answer without executing tools", async () => {
    const { ask, seen } = fakeAsk([{ toolCalls: [], finalText: "Hello Niloy." }]);
    const r = await runAgentTurn({
      message: "hi",
      history: [],
      ctx,
      userKey: "t",
      lang: "en",
      ask,
      exec: async () => {
        throw new Error("must not execute");
      },
    });
    expect(r.text).toBe("Hello Niloy.");
    expect(seen).toHaveLength(1);
    expect(seen[0].tools.length).toBeGreaterThan(0); // tools were offered
  });

  it("executes a tool, feeds the result back, and collects mutations", async () => {
    const call: ToolCall = {
      id: "c1",
      name: "update_application_status",
      input: { opportunity_id: "abc", status: "applied" },
    };
    const { ask, seen } = fakeAsk([
      { toolCalls: [call], finalText: "" },
      { toolCalls: [], finalText: "Tracked it." },
    ]);
    const r = await runAgentTurn({
      message: "mark bkash applied",
      history: [],
      ctx,
      userKey: "t",
      lang: "en",
      ask,
      exec: async (c) => ({
        result: `{"ok":true,"echo":"${c.name}"}`,
        mutation: { type: "application_status", opportunity_id: "abc", status: "applied" },
      }),
    });
    expect(r.text).toBe("Tracked it.");
    expect(r.mutations).toHaveLength(1);
    // second ask must contain the assistant tool-call turn AND the tool_result
    const second = seen[1].messages;
    const asst = second.find((m) => m.role === "assistant");
    const tr = second.find((m) => m.role === "tool_result");
    expect(asst && "toolCalls" in asst && asst.toolCalls?.[0].id).toBe("c1");
    expect(tr && tr.role === "tool_result" && tr.content).toContain("update_application_status");
  });

  it("caches get_reality_check per (user, opportunity)", async () => {
    let execCount = 0;
    const rc: ToolCall = {
      id: "c1",
      name: "get_reality_check",
      input: { opportunity_id: "opp-1" },
    };
    const script: AgentResult[] = [
      { toolCalls: [rc], finalText: "" },
      { toolCalls: [], finalText: "34%." },
    ];
    const exec = async () => {
      execCount++;
      return { result: '{"percent":34}' };
    };
    const base = { history: [], ctx, lang: "en" as const, exec };
    await runAgentTurn({ ...base, message: "odds?", userKey: "u", ask: fakeAsk(script).ask });
    await runAgentTurn({ ...base, message: "odds again?", userKey: "u", ask: fakeAsk(script).ask });
    expect(execCount).toBe(1); // second turn served from cache
    await runAgentTurn({ ...base, message: "odds?", userKey: "OTHER", ask: fakeAsk(script).ask });
    expect(execCount).toBe(2); // different user, fresh execution
  });

  it("forces a tools-off final answer when rounds are exhausted", async () => {
    const rc: ToolCall = { id: "c", name: "get_user_profile", input: {} };
    const { ask, seen } = fakeAsk([
      { toolCalls: [rc], finalText: "" },
      { toolCalls: [rc], finalText: "" },
      { toolCalls: [rc], finalText: "" },
      { toolCalls: [], finalText: "Final answer." },
    ]);
    const r = await runAgentTurn({
      message: "loop forever",
      history: [],
      ctx,
      userKey: "t",
      lang: "en",
      ask,
      exec: async () => ({ result: "{}" }),
    });
    expect(r.text).toBe("Final answer.");
    expect(seen).toHaveLength(4);
    expect(seen[3].tools).toHaveLength(0); // final call offered NO tools
  });

  it("system prompt carries the language, the date, and the honesty rules", async () => {
    const { ask, seen } = fakeAsk([{ toolCalls: [], finalText: "ঠিক আছে" }]);
    await runAgentTurn({
      message: "hi",
      history: [],
      ctx,
      userKey: "t",
      lang: "bn",
      ask,
      now: () => new Date("2026-07-06T10:00:00Z"),
    });
    const sys = seen[0].system ?? "";
    expect(sys).toContain("Reply in Bangla.");
    expect(sys).toContain("2026-07-06");
    expect(sys).toContain("Never invent");
  });
});
