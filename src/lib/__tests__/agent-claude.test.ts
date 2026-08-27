/**
 * Claude provider translation.
 *
 * Only the pure functions are tested here — the same split gemini.ts uses.
 * askClaude/askClaudeStream are thin wrappers over the SDK and would need a
 * live key to mean anything; asserting against a hand-mocked HTTP client would
 * only test the mock.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  ClaudeRefusalError,
  parseAnthropicResponse,
  toAnthropicMessages,
  toAnthropicTools,
} from "@/lib/agent/claude";
import type { AgentMessage, ToolDef } from "@/lib/agent/adapter";

/** Builds a Message with only the fields the parser reads. */
function msg(
  content: Anthropic.ContentBlock[],
  stop: Anthropic.Message["stop_reason"] = "end_turn",
  stopDetails: Anthropic.Message["stop_details"] = null
): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content,
    stop_reason: stop,
    stop_details: stopDetails,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

describe("toAnthropicMessages", () => {
  it("passes a user turn through as a plain string", () => {
    expect(toAnthropicMessages([{ role: "user", content: "hi" }])).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("carries assistant text and tool calls in one content array", () => {
    const out = toAnthropicMessages([
      {
        role: "assistant",
        content: "Looking that up.",
        toolCalls: [
          { id: "t1", name: "list_opportunities", input: { limit: 5 } },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking that up." },
          {
            type: "tool_use",
            id: "t1",
            name: "list_opportunities",
            input: { limit: 5 },
          },
        ],
      },
    ]);
  });

  it("omits an assistant turn with no text and no tool calls", () => {
    // Empty content is rejected by the API rather than ignored.
    expect(toAnthropicMessages([{ role: "assistant", content: "" }])).toEqual([]);
  });

  it("turns a tool result into a block on a user turn", () => {
    const out = toAnthropicMessages([
      { role: "tool_result", tool_use_id: "t1", name: "x", content: "ok" },
    ]);
    expect(out).toEqual([
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
      },
    ]);
  });

  /**
   * The one that actually bites. Consecutive tool results must land in a
   * single user turn — one turn each reads as several separate human messages
   * and degrades multi-turn tool use.
   */
  it("merges consecutive tool results into one user turn", () => {
    const out = toAnthropicMessages([
      { role: "tool_result", tool_use_id: "t1", name: "a", content: "1" },
      { role: "tool_result", tool_use_id: "t2", name: "b", content: "2" },
      { role: "tool_result", tool_use_id: "t3", name: "c", content: "3" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toHaveLength(3);
  });

  it("does not merge tool results across an intervening turn", () => {
    const out = toAnthropicMessages([
      { role: "tool_result", tool_use_id: "t1", name: "a", content: "1" },
      { role: "user", content: "and now?" },
      { role: "tool_result", tool_use_id: "t2", name: "b", content: "2" },
    ]);
    expect(out).toHaveLength(3);
  });

  it("does not append a tool result onto an ordinary user turn", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "hi" },
      { role: "tool_result", tool_use_id: "t1", name: "a", content: "1" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ role: "user", content: "hi" });
  });

  it("round-trips a full tool-use exchange in order", () => {
    const conversation: AgentMessage[] = [
      { role: "user", content: "any paid internships?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "t1", name: "search", input: { paid: true } }],
      },
      { role: "tool_result", tool_use_id: "t1", name: "search", content: "[]" },
    ];
    const out = toAnthropicMessages(conversation);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});

describe("toAnthropicTools", () => {
  it("passes the adapter tool shape straight through", () => {
    const tools: ToolDef[] = [
      {
        name: "get_profile",
        description: "Read the signed-in student's profile",
        input_schema: { type: "object", properties: {} },
      },
    ];
    expect(toAnthropicTools(tools)).toEqual(tools);
  });
});

describe("parseAnthropicResponse", () => {
  it("joins text blocks and trims", () => {
    const r = parseAnthropicResponse(
      msg([
        { type: "text", text: "  Dhaka " } as Anthropic.ContentBlock,
        { type: "text", text: "listings.  " } as Anthropic.ContentBlock,
      ])
    );
    expect(r.finalText).toBe("Dhaka listings.");
    expect(r.toolCalls).toEqual([]);
  });

  it("extracts tool calls with their real ids", () => {
    // The id must be the provider's own — it is echoed back on the matching
    // tool_result, and a synthesised one would never match.
    const r = parseAnthropicResponse(
      msg(
        [
          {
            type: "tool_use",
            id: "toolu_abc",
            name: "search",
            input: { q: "dhaka" },
          } as Anthropic.ContentBlock,
        ],
        "tool_use"
      )
    );
    expect(r.toolCalls).toEqual([
      { id: "toolu_abc", name: "search", input: { q: "dhaka" } },
    ]);
  });

  it("ignores thinking blocks", () => {
    const r = parseAnthropicResponse(
      msg([
        { type: "thinking", thinking: "hmm", signature: "s" } as unknown as Anthropic.ContentBlock,
        { type: "text", text: "answer" } as Anthropic.ContentBlock,
      ])
    );
    expect(r.finalText).toBe("answer");
  });

  it("throws on a refusal rather than returning empty text", () => {
    // Returning "" here would read to the caller as "nothing to say" instead
    // of "declined" — the exact kind of quiet misreport Shuru forbids.
    expect(() =>
      parseAnthropicResponse(
        msg([], "refusal", {
          type: "refusal",
          category: "cyber",
        } as unknown as Anthropic.Message["stop_details"])
      )
    ).toThrow(ClaudeRefusalError);
  });

  it("carries the refusal category when there is one", () => {
    try {
      parseAnthropicResponse(
        msg([], "refusal", {
          type: "refusal",
          category: "bio",
        } as unknown as Anthropic.Message["stop_details"])
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as ClaudeRefusalError).category).toBe("bio");
    }
  });

  it("tolerates a refusal with no stop_details", () => {
    try {
      parseAnthropicResponse(msg([], "refusal"));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as ClaudeRefusalError).category).toBeNull();
    }
  });
});
