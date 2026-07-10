/**
 * /api/ingest — manual refresh of remote listings (no cron; hit it when
 * you want fresh rows). POST triggers; GET reports status only.
 *
 * Protection (approved call #3): if INGEST_SECRET is set in env, POST
 * requires it (x-ingest-secret header or ?secret=). Unset → open, but the
 * 15-minute in-memory cooldown still applies.
 *
 * Persistence:
 *  - Supabase mode: upsert accepted rows (onConflict id — deterministic
 *    ids make refresh idempotent), curated rows untouched.
 *  - Demo mode: the server can't write localStorage; accepted rows are
 *    RETURNED and the client (I4) merges them by id.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  cooldownRemainingMs,
  markSuccessfulRun,
  runIngest,
} from "@/lib/ingest/refresh";
import { isDemoMode } from "@/lib/demoMode";
import { SEED_OPPORTUNITIES } from "@/lib/data/seed";
import { supabaseServiceRole } from "@/lib/supabase/server";
import type { Opportunity } from "@/lib/types";
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
  return NextResponse.json({
    enabled: true,
    demo: isDemoMode(),
    secret_required: secretRequired(),
    cooldown_remaining_s: Math.ceil(cooldownRemainingMs() / 1000),
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

  // everything already known, for dedup: seed (demo) / full table (supabase)
  let existing: Opportunity[];
  let db: SupabaseClient | null = null;
  if (isDemoMode()) {
    existing = SEED_OPPORTUNITIES;
  } else {
    // Supabase mode: writes to `opportunities` are RLS-blocked for the anon
    // key, so ingestion MUST use the service-role client. Fail loudly with an
    // actionable message if the key isn't configured.
    try {
      db = supabaseServiceRole();
    } catch (e) {
      return NextResponse.json(
        { error: "service_role_key_missing", detail: (e as Error).message },
        { status: 500 }
      );
    }
    const { data, error } = await db.from("opportunities").select("*");
    if (error) {
      return NextResponse.json({ error: "db_read_failed" }, { status: 502 });
    }
    existing = (data ?? []) as Opportunity[];
  }

  const result = await runIngest(existing);

  if (result.fetched.remoteok === null && result.fetched.arbeitnow === null) {
    // nothing reachable — do NOT burn the cooldown
    return NextResponse.json({ error: "sources_unreachable" }, { status: 502 });
  }
  markSuccessfulRun();

  if (isDemoMode()) {
    // client merges by id (I4)
    return NextResponse.json({
      mode: "demo",
      fetched: result.fetched,
      normalized: result.normalized,
      accepted: result.accepted,
      refreshed: result.refreshed,
      skipped: result.skipped,
    });
  }

  if (result.accepted.length > 0) {
    const { error } = await db!
      .from("opportunities")
      .upsert(result.accepted, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: "db_write_failed" }, { status: 502 });
    }
  }
  return NextResponse.json({
    mode: "supabase",
    fetched: result.fetched,
    normalized: result.normalized,
    inserted_or_refreshed: result.accepted.length,
    refreshed: result.refreshed,
    skipped: result.skipped,
  });
}
