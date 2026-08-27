/**
 * POST /api/payments/sandbox-confirm — stands in for the payment provider.
 *
 * This is the ONLY part of the payment flow that is pretend, and it is the
 * part a real provider would own: the page where a payer confirms, and the
 * server that then sends a signed webhook.
 *
 * It exists so the sandbox does not shortcut. Rather than flipping a row to
 * 'succeeded', it constructs a properly HMAC-signed event and delivers it to
 * `/api/payments/webhook` over HTTP — the same handler, the same signature
 * check, the same idempotency key a production provider would exercise. The
 * only fiction is that no money moved.
 *
 * It is employer-authenticated so a stranger cannot drive another company's
 * sandbox payment to completion. A real provider's webhook is authenticated by
 * signature instead; this endpoint is not that webhook, it is the thing that
 * *sends* it.
 */

import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { SANDBOX_HEADERS, signPayload } from "@/lib/payments/sandbox";
import { selectPaymentProvider } from "@/lib/payments";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireRole("employer");
  } catch (err) {
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const provider = selectPaymentProvider();
  if (!provider.isSandbox) {
    // A real provider sends its own webhooks. If this endpoint were reachable
    // against one, it would be a way to mint successful payments.
    return NextResponse.json(
      { error: "not_available_for_this_provider" },
      { status: 400 }
    );
  }

  let body: { session_id?: unknown; outcome?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = body.session_id;
  const outcome = body.outcome === "failed" ? "failed" : "succeeded";
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "session_id_required" }, { status: 400 });
  }

  // Confirm the caller actually owns this payment. RLS on `payments` limits
  // the read to their own company, so a session id belonging to someone else
  // simply is not found.
  const sb = await supabaseServer();
  const { data: payment } = await sb
    .from("payments")
    .select("id, status")
    .eq("provider_session_id", sessionId)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }

  const payload = JSON.stringify({
    session_id: sessionId,
    outcome,
    ...(outcome === "failed" ? { failure_reason: "sandbox_declined" } : {}),
  });

  /*
   * Deliver to this deployment's own origin, not NEXT_PUBLIC_SITE_URL.
   *
   * Same reasoning as /api/cron: the request already arrived at the instance
   * that should do the work, and the configured value can be stale or pinned
   * to a port nothing is serving.
   */
  const target = `${req.nextUrl.origin}/api/payments/webhook`;

  const res = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SANDBOX_HEADERS.signature]: signPayload(payload),
      // Fresh per delivery. Re-confirming issues a NEW event id, which is what
      // lets the idempotency guard be exercised honestly: the same event
      // replayed is deduped, a genuinely new event is processed.
      [SANDBOX_HEADERS.eventId]: `evt_${randomUUID()}`,
    },
    body: payload,
  });

  const result = await res.json().catch(() => ({}));
  return NextResponse.json(
    { delivered: res.ok, webhook_status: res.status, result },
    { status: res.ok ? 200 : 502 }
  );
}
