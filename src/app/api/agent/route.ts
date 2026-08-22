/**
 * /api/agent — thin shell over the agent loop (src/lib/agent/loop.ts).
 * Receives one user message + capped chat history, runs the tool loop
 * server-side, returns { text, mutations, remaining }.
 *
 * Two response modes on POST:
 *  - default: buffered JSON (back-compatible contract).
 *  - Accept: text/event-stream → Server-Sent Events that stream the answer
 *    token-by-token (magical chat). The client falls back to the JSON mode
 *    if streaming setup fails.
 * GET reports { enabled } so the UI can hide the entry point without a key.
 */

import { NextRequest, NextResponse } from "next/server";
import { agentEnabled, AgentNotConfiguredError } from "@/lib/agent/adapter";
import {
  capHistory,
  checkRateLimit,
  runAgentTurn,
  runAgentTurnStream,
} from "@/lib/agent/loop";
import { supabaseServer } from "@/lib/supabase/server";
import type { ClientMutation, ToolContext } from "@/lib/agent/tools";
import type { ResumeContent } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ enabled: agentEnabled() });
}

type AgentBody = {
  message?: string;
  history?: unknown;
  lang?: "en" | "bn";
  /** client-generated id, used for rate limiting before a session exists */
  sessionId?: string;
  /** an in-chat attached resume (already parsed via /api/parse-resume) */
  attachedResume?: ResumeContent | null;
};

async function resolveUserKey(body: AgentBody): Promise<string> {
  try {
    const {
      data: { user },
    } = await supabaseServer().auth.getUser();
    if (user) return `sb:${user.id}`;
  } catch {
    /* fall through to the client-supplied key */
  }
  const sid = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  return sid ? `sid:${sid}` : "anon";
}

function buildCtx(body: AgentBody): ToolContext {
  return { attachedResume: body.attachedResume ?? null };
}

export async function POST(req: NextRequest) {
  if (!agentEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: AgentBody;
  try {
    body = (await req.json()) as AgentBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }

  const userKey = await resolveUserKey(body);
  const limit = checkRateLimit(userKey);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited", remaining: 0 }, { status: 429 });
  }

  const lang = body.lang === "bn" ? "bn" : "en";
  const ctx = buildCtx(body);
  const history = capHistory(body.history);
  const wantsStream = (req.headers.get("accept") ?? "").includes("text/event-stream");

  // ── streaming (SSE) ──
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          send({ type: "meta", remaining: limit.remaining });
          const { text } = await runAgentTurnStream({
            message,
            history,
            ctx,
            userKey,
            lang,
            onDelta: (t) => send({ type: "delta", text: t }),
            onReset: () => send({ type: "reset" }),
            onMutation: (m: ClientMutation) => send({ type: "mutation", mutation: m }),
          });
          if (!text) send({ type: "error", error: "empty" });
          else send({ type: "done", text });
        } catch (e) {
          send({
            type: "error",
            error: e instanceof AgentNotConfiguredError ? "not_configured" : "upstream",
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ── buffered JSON (default / fallback) ──
  try {
    const { text, mutations } = await runAgentTurn({ message, history, ctx, userKey, lang });
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json({ text, mutations, remaining: limit.remaining });
  } catch (e) {
    if (e instanceof AgentNotConfiguredError) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
