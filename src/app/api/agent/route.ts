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
 * GET reports { enabled } so the UI can hide the entry point without a key,
 * and { pro } so it can show a locked state instead of a dead button.
 *
 * The agent is a Pro feature: every turn spends money on a model call. The
 * gate is `requirePro` below, before anything is parsed or dispatched — a 402
 * carries the upgrade path, where a 403 would tell the client to give up.
 */

import { NextRequest, NextResponse } from "next/server";
import { agentEnabled, AgentNotConfiguredError } from "@/lib/agent/adapter";
import {
  capHistory,
  checkRateLimit,
  runAgentTurn,
  runAgentTurnStream,
} from "@/lib/agent/loop";
import { proAccess, proRequiredResponse, requirePro } from "@/lib/auth/pro";
import { authErrorResponse } from "@/lib/auth/session";
import type { ClientMutation, ToolContext } from "@/lib/agent/tools";
import type { ResumeContent } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  // Availability is two separate facts and the UI needs both: whether the
  // deployment has a model key at all, and whether THIS caller may use it.
  // Collapsing them would make an unsubscribed user on a fully configured
  // deployment look like a broken install.
  let pro = false;
  try {
    pro = (await proAccess()).isPro;
  } catch {
    // Not signed in. Not an error for a capability probe — just not Pro.
  }
  return NextResponse.json({ enabled: agentEnabled(), pro });
}

type AgentBody = {
  message?: string;
  history?: unknown;
  lang?: "en" | "bn";
  /**
   * Legacy field. Rate limiting keys on the authenticated user now that the
   * route is Pro-gated; older clients still send this and are not rejected
   * for it.
   */
  sessionId?: string;
  /** an in-chat attached resume (already parsed via /api/parse-resume) */
  attachedResume?: ResumeContent | null;
};

function buildCtx(body: AgentBody): ToolContext {
  return { attachedResume: body.attachedResume ?? null };
}

export async function POST(req: NextRequest) {
  if (!agentEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let userKey: string;
  try {
    const access = await requirePro("agent");
    // The rate-limit key no longer needs a client-supplied session id: the
    // gate above already established who this is, so there is no anonymous
    // caller left to key on.
    userKey = `sb:${access.user.id}`;
  } catch (err) {
    const paid = proRequiredResponse(err);
    if (paid) return paid;
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
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
