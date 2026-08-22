/**
 * /api/ingest — refresh internship listings from every configured source.
 * POST triggers a run; GET reports status and which adapters are active.
 *
 * Protection: if INGEST_SECRET is set, POST requires it (x-ingest-secret
 * header or ?secret=). Unset → open, but the 15-minute in-memory cooldown
 * still applies. Set it in any deployment reachable from the internet.
 *
 * Persistence: accepted rows are upserted onConflict id — deterministic ids
 * make a refresh idempotent, so re-running updates rather than duplicates.
 * Employer-posted rows are never touched (they carry source 'shuru').
 *
 * Every run is recorded in public.ingestion_runs, including per-source
 * failures, so a silently dead source is visible instead of looking like a
 * quiet day on the job boards.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  cooldownRemainingMs,
  markSuccessfulRun,
  runIngest,
} from "@/lib/ingest/refresh";
import { adapterAvailability } from "@/lib/ingest/adapters";
import { assessSourceHealth, needsAttention } from "@/lib/ingest/health";
import { supabaseServiceRole } from "@/lib/supabase/server";
import type { SourceHealth } from "@/lib/ingest/health";
import type { SourceReport } from "@/lib/ingest/refresh";
import type { IngestionRun, Opportunity } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function secretRequired(): boolean {
  return Boolean(process.env.INGEST_SECRET);
}

function secretOk(req: NextRequest): boolean {
  if (!secretRequired()) return true;
  const provided =
    req.headers.get("x-ingest-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return provided === process.env.INGEST_SECRET;
}

export async function GET() {
  const availability = adapterAvailability();

  // Health is derived from recorded runs, so it is reported only when those
  // runs are readable. A missing service-role key must not turn a status
  // endpoint into a 500 — availability alone is still useful.
  let health: SourceHealth[] | null = null;
  let healthError: string | null = null;
  try {
    const db = supabaseServiceRole();
    const { data, error } = await db
      .from("ingestion_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    health = assessSourceHealth(
      (data ?? []) as IngestionRun[],
      availability.filter((a) => a.available).map((a) => a.source)
    );
  } catch (e) {
    healthError = (e as Error).message;
  }

  return NextResponse.json({
    enabled: true,
    secret_required: secretRequired(),
    cooldown_remaining_s: Math.ceil(cooldownRemainingMs() / 1000),
    sources: availability,
    health,
    health_error: healthError,
    needs_attention: health ? needsAttention(health) : null,
  });
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const remaining = cooldownRemainingMs();
  if (remaining > 0) {
    return NextResponse.json(
      { error: "cooldown", retry_after_s: Math.ceil(remaining / 1000) },
      { status: 429 }
    );
  }

  // Everything already known, so dedup can tell a new listing from a
  // refresh. Writes to `opportunities` are RLS-blocked for the anon key, so
  // ingestion MUST use the service-role client; fail loudly with an
  // actionable message if the key isn't configured.
  let db: SupabaseClient;
  try {
    db = supabaseServiceRole();
  } catch (e) {
    return NextResponse.json(
      { error: "service_role_key_missing", detail: (e as Error).message },
      { status: 500 }
    );
  }
  const { data, error: readError } = await db.from("opportunities").select("*");
  if (readError) {
    return NextResponse.json({ error: "db_read_failed" }, { status: 502 });
  }
  const existing = (data ?? []) as Opportunity[];

  const result = await runIngest(existing);

  if (result.allSourcesFailed) {
    // nothing reachable — do NOT burn the cooldown
    await recordRuns(db, result.sources, "failed");
    return NextResponse.json(
      { error: "sources_unreachable", sources: result.sources },
      { status: 502 }
    );
  }
  markSuccessfulRun();

  if (result.accepted.length > 0) {
    const { error } = await db
      .from("opportunities")
      .upsert(result.accepted, { onConflict: "id" });
    if (error) {
      await recordRuns(db, result.sources, "failed", error.message);
      return NextResponse.json({ error: "db_write_failed" }, { status: 502 });
    }
  }

  await recordRuns(db, result.sources, "success");

  return NextResponse.json({
    fetched: result.fetched,
    sources: result.sources,
    normalized: result.normalized,
    inserted_or_refreshed: result.accepted.length,
    refreshed: result.refreshed,
    skipped: result.skipped,
  });
}

/**
 * One ingestion_runs row per source. Bookkeeping must never fail the
 * request: if the insert errors the listings are already persisted, and
 * losing the audit row is strictly less bad than a 500.
 */
async function recordRuns(
  db: SupabaseClient,
  sources: SourceReport[],
  overall: "success" | "failed",
  extraError?: string
): Promise<void> {
  if (sources.length === 0) return;
  const now = new Date().toISOString();
  const rows = sources.map((s) => ({
    source: s.source,
    started_at: now,
    finished_at: now,
    status:
      s.fetched === null
        ? "failed"
        : s.error
          ? "partial"
          : overall === "failed"
            ? "failed"
            : "success",
    fetched: s.fetched ?? 0,
    kept: s.kept,
    error: extraError ?? s.error,
    trigger_source: "manual" as const,
  }));
  try {
    await db.from("ingestion_runs").insert(rows);
  } catch {
    /* bookkeeping is best-effort */
  }
}
