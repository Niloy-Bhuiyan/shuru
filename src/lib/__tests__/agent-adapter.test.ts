import { describe, expect, it } from "vitest";
import {
  parseGeminiResponse,
  toGeminiBody,
  toGeminiContents,
  toGeminiSchema,
} from "@/lib/agent/gemini";
import type { AgentMessage, ToolDef } from "@/lib/agent/adapter";

const tool: ToolDef = {
  name: "get_reality_check",
  description: "Compute honest shortlist odds for an opportunity",
  input_schema: {
    type: "object",
    properties: {
      opportunity_id: { type: "string", description: "listing uuid" },
      verbose: { type: "boolean", default: false },
    },
    required: ["opportunity_id"],
  },
};

describe("toGeminiSchema", () => {
  it("uppercases type names recursively and drops unsupported keys", () => {
    const s = toGeminiSchema(tool.input_schema) as Record<string, unknown>;
    expect(s.type).toBe("OBJECT");
    const props = s.properties as Record<string, Record<string, unknown>>;
    expect(props.opportunity_id.type).toBe("STRING");
    expect(props.verbose.type).toBe("BOOLEAN");
    expect("default" in props.verbose).toBe(false);
    expect(s.required).toEqual(["opportunity_id"]);
  });
});

describe("toGeminiContents", () => {
  it("maps the full loop: user → assistant toolCalls → tool_result", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "What are my odds at bKash?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_0", name: "get_reality_check", input: { opportunity_id: "abc" } },
        ],
      },
      {
        role: "tool_result",
        tool_use_id: "call_0",
        name: "get_reality_check",
        content: '{"percent":34}',
      },
    ];
    const c = toGeminiContents(messages);
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual({ role: "user", parts: [{ text: "What are my odds at bKash?" }] });
    expect(c[1].role).toBe("model");
    expect(c[1].parts[0]).toEqual({
      functionCall: { name: "get_reality_check", args: { opportunity_id: "abc" } },
    });
    expect(c[2].role).toBe("function");
    expect(c[2].parts[0]).toEqual({
      functionResponse: {
        name: "get_reality_check",
        response: { result: '{"percent":34}' },
      },
    });
  });

  it("skips empty assistant turns and keeps text+toolCalls together", () => {
    const c = toGeminiContents([
      { role: "assistant", content: "" },
      {
        role: "assistant",
        content: "Checking…",
        toolCalls: [{ id: "x", name: "t", input: {} }],
      },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].parts).toHaveLength(2);
  });
});

describe("toGeminiBody", () => {
  it("includes system_instruction and functionDeclarations only when given", () => {
    const bare = toGeminiBody([{ role: "user", content: "hi" }], [], {});
    expect("tools" in bare).toBe(false);
    expect("system_instruction" in bare).toBe(false);

    const full = toGeminiBody([{ role: "user", content: "hi" }], [tool], {
      system: "You are Shuru's agent.",
      maxTokens: 99,
    });
    expect(full.system_instruction).toEqual({ parts: [{ text: "You are Shuru's agent." }] });
    const tools = full.tools as { functionDeclarations: { name: string }[] }[];
    expect(tools[0].functionDeclarations[0].name).toBe("get_reality_check");
    expect((full.generationConfig as { maxOutputTokens: number }).maxOutputTokens).toBe(99);
  });
});

describe("parseGeminiResponse", () => {
  it("returns finalText for plain answers", () => {
    const r = parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "Your odds are " }, { text: "34%." }] } }],
    });
    expect(r.finalText).toBe("Your odds are 34%.");
    expect(r.toolCalls).toHaveLength(0);
  });

  it("extracts tool calls with stable ids and empty-arg safety", () => {
    const r = parseGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "get_user_profile" } },
              { functionCall: { name: "search_opportunities", args: { q: "ml" } } },
            ],
          },
        },
      ],
    });
    expect(r.toolCalls).toHaveLength(2);
    expect(r.toolCalls[0]).toEqual({
      id: "call_0_get_user_profile",
      name: "get_user_profile",
      input: {},
    });
    expect(r.toolCalls[1].input).toEqual({ q: "ml" });
    expect(r.finalText).toBe("");
  });

  it("survives an empty/blocked response", () => {
    const r = parseGeminiResponse({});
    expect(r).toEqual({ toolCalls: [], finalText: "" });
  });
});
