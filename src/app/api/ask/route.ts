/**
 * /api/ask — ask a question about internship listings, answered from the text
 * those listings publish, with a citation for every claim.
 *
 * This is the only path between the browser and the Python retrieval service
 * (services/rag). The service token never leaves the server; the caller's
 * identity comes from the verified Supabase session, not from the request
 * body, so a client cannot spend another student's daily quota by claiming
 * their id.
 *
 *   GET  → availability probe, so the UI can hide the feature cleanly
 *   POST → { question } → { answer, abstained, abstain_reason, citations }
 *
 * An abstention is a successful response, not an error. The service declining
 * to answer is the product working, and flattening it into a 4xx would train
 * the UI to show a failure state for Shuru's most important behaviour.
 */

import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/session";
import { proAccess, proRequiredResponse, requirePro } from "@/lib/auth/pro";
import {
  askRag,
  ragConfigured,
  ragMissingVars,
  RagUnavailableError,
} from "@/lib/rag/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Matches the service's own bound; rejected here so a huge body is never sent. */
const MAX_QUESTION_CHARS = 500;

export async function GET() {
  try {
    // Signed-in only: whether this deployment runs a retrieval service is
    // operator information, not something to volunteer to anonymous callers.
    await requireUser();
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  // `pro` rides along so the Ask box can render a locked state rather than a
  // button that returns 402 when pressed. Availability and entitlement are
  // different facts; a UI that conflates them tells an unsubscribed user the
  // feature is broken.
  const pro = await proAccess()
    .then((a) => a.isPro)
    .catch(() => false);

  return NextResponse.json({
    available: ragConfigured(),
    pro,
    // Named so an operator reading the probe knows exactly what to set. Safe
    // to expose to a signed-in user: these are variable names, not values.
    missing: ragMissingVars(),
  });
}

export async function POST(req: NextRequest) {
  // Pro-gated: every question runs an embedding call and a generation call
  // against the retrieval service. `requirePro` subsumes the sign-in check —
  // it calls `requireUser` first — so a signed-out caller still gets a 401 and
  // an unsubscribed one gets a 402 carrying the upgrade path.
  let userId: string;
  try {
    const access = await requirePro("ask");
    userId = access.user.id;
  } catch (err) {
    const paid = proRequiredResponse(err);
    if (paid) return paid;
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  if (!ragConfigured()) {
    return NextResponse.json(
      { error: "not_configured", missing: ragMissingVars() },
      { status: 503 }
    );
  }

  let question: unknown;
  let opportunityId: unknown;
  try {
    const body = await req.json();
    question = body?.question;
    opportunityId = body?.opportunity_id;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json({ error: "question_required" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: "question_too_long", max: MAX_QUESTION_CHARS },
      { status: 400 }
    );
  }

  try {
    const result = await askRag(
      question.trim(),
      userId,
      typeof opportunityId === "string" ? opportunityId : undefined
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RagUnavailableError) {
      // 429 is the one the UI must distinguish: it is the user's own quota,
      // not a broken service, and it resets.
      const status = e.detail === "daily_limit_reached" ? 429 : 503;
      return NextResponse.json({ error: e.detail }, { status });
    }
    throw e;
  }
}
