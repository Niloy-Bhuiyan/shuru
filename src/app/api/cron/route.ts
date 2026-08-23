/**
 * /api/cron — scheduled-job entry point for Vercel Cron.
 *
 * Vercel Cron can only issue a GET and cannot attach custom headers; it sends
 * `Authorization: Bearer $CRON_SECRET` instead. The job endpoints themselves
 * are POST + `x-ingest-secret`, which is the right shape for an action and
 * keeps GET safe. This route bridges the two: it authenticates the scheduler,
 * then performs the real POST.
 *
 *   GET /api/cron?job=ingest
 *   GET /api/cron?job=dispatch
 *
 * The internal hop costs one extra request on the same host. That is the price
 * of not making GET mutate state — a crawler, a prefetch or a browser preview
 * hitting a mutating GET is a genuine hazard, and Vercel's own docs warn that
 * cron paths are publicly reachable.
 *
 * Any scheduler that can POST with a header should skip this route and call
 * the job endpoints directly.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOBS = {
  ingest: "/api/ingest",
  dispatch: "/api/notifications/dispatch",
} as const;

type JobName = keyof typeof JOBS;

/**
 * Constant-time-ish comparison. Not a full HMAC check, but it avoids the
 * trivially observable early-exit of `===` on a secret compare.
 */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Refuse rather than run open. An unauthenticated public URL that triggers
  // ingestion is a denial-of-wallet vector, so a missing secret is a
  // misconfiguration, not a reason to allow the call.
  if (!cronSecret) {
    return NextResponse.json(
      { error: "cron_not_configured", detail: "CRON_SECRET is not set" },
      { status: 503 }
    );
  }

  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secretsMatch(provided, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") as JobName | null;
  if (!job || !(job in JOBS)) {
    return NextResponse.json(
      { error: "unknown_job", expected: Object.keys(JOBS) },
      { status: 400 }
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const target = `${origin.replace(/\/+$/, "")}${JOBS[job]}`;

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "x-ingest-secret": process.env.INGEST_SECRET ?? "",
        "content-type": "application/json",
      },
    });
    const body = await res.json().catch(() => ({}));
    // Pass the job's own status through so a failing job shows as failing in
    // the scheduler's history rather than as a green run.
    return NextResponse.json({ job, status: res.status, result: body }, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { job, error: "job_unreachable", detail: (e as Error).message },
      { status: 502 }
    );
  }
}
