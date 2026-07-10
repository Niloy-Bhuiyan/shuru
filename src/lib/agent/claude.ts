/**
 * CLAUDE PROVIDER — STUB. This is exactly where a Claude implementation
 * plugs in later; nothing outside adapter.ts changes when it does.
 *
 * To activate:
 *   1. Set ANTHROPIC_API_KEY in .env.local (and Vercel env).
 *   2. Implement askClaude below (the mapping is sketched in full).
 *   3. In adapter.ts, uncomment anthropicKey() and the askClaude branch.
 *
 * The adapter contract was designed Claude-first, so the translation is
 * nearly a passthrough:
 *
 *   TOOLS      → send ToolDef[] AS-IS. Anthropic's `tools` field is the
 *                same shape: { name, description, input_schema }.
 *
 *   MESSAGES   → POST https://api.anthropic.com/v1/messages
 *                headers: { "x-api-key": key,
 *                           "anthropic-version": "2023-06-01",
 *                           "content-type": "application/json" }
 *                body.system   = opts.system
 *                body.model    = e.g. "claude-haiku-4-5-20251001" (cheap tier)
 *                body.max_tokens = opts.maxTokens ?? 1024
 *                body.messages = ours, mapped:
 *                  { role:"user", content }            → same
 *                  { role:"assistant", content,
 *                    toolCalls }                       → assistant content
 *                       blocks: [{type:"text",text}, ...toolCalls.map(c =>
 *                       ({type:"tool_use", id:c.id, name:c.name,
 *                         input:c.input}))]
 *                  { role:"tool_result", tool_use_id,
 *                    content }                         → USER message with
 *                       content: [{type:"tool_result",
 *                         tool_use_id, content}]
 *                       (consecutive tool_results merge into one user turn)
 *
 *   RESPONSE   → data.content blocks:
 *                  {type:"text", text}                 → finalText (+concat)
 *                  {type:"tool_use", id, name, input}  → ToolCall as-is
 *                data.stop_reason === "tool_use" ⇒ toolCalls non-empty.
 */

import type { AgentMessage, AgentResult, AskOptions, ToolDef } from "./adapter";

export async function askClaude(
  _key: string,
  _messages: AgentMessage[],
  _tools: ToolDef[],
  _opts: AskOptions
): Promise<AgentResult> {
  throw new Error(
    "claude.ts is a stub — implement per the mapping documented above, then enable the branch in adapter.ts"
  );
}
