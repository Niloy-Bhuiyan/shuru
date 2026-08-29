/**
 * POST /api/discover — find internships by searching the live web.
 *
 * The pipeline, and the order is the whole design:
 *
 *   profile ─► prompt ─► provider web search ─► parse ─► VERIFY ─► insert
 *                                                          │
 *                                          fetch each URL and read the page
 *
 * Verification is not a filter applied to results; it is what decides whether
 * a result is a result. A candidate whose URL does not resolve, or whose page
 * does not mention both the company and the role, never becomes a row. See
 * `src/lib/discovery/verify.ts` and ADR 0004.
 *
 * ── Two audiences, two outputs, and they are different on purpose ─────────
 *
 * The STUDENT who ran the search gets the verified candidates back
 * immediately, with the URLs. That is the real value and it is safe to give
 * them: every link has been fetched and confirmed to be a page about that
 * company and that role. They can apply today.
 *
 * The SHARED RADAR FEED gets nothing until an admin approves. Rows are
 * inserted `status: 'pending'`, landing in the moderation queue that already
 * exists. A student choosing to trust a link they asked for is a different
 * thing from Shuru asserting to everyone that a listing is real.
 *
 * ── Why the counts are returned ──────────────────────────────────────────
 *
 * `rejected` is reported rather than swallowed. "6 found, 5 rejected because
 * the company was not on the page" tells an operator the model is inventing
 * employers. Silently returning one listing tells them the web is empty.
 */

import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/session";
import { proRequiredResponse, requirePro } from "@/lib/auth/pro";
import { supabaseServer, supabaseServiceRole } from "@/lib/supabase/server";
import { AgentNotConfiguredError } from "@/lib/agent/adapter";
import { searchWeb, webSearchEnabled } from "@/lib/agent/websearch";
import { checkRateLimit } from "@/lib/agent/loop";
import { buildDiscoveryPrompt, SYSTEM_PROMPT } from "@/lib/discovery/prompt";
import { parseDiscovery } from "@/lib/discovery/parse";
import { verifyCandidates, type VerifiedCandidate } from "@/lib/discovery/verify";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Search plus up to eight page fetches. The default 15s is not enough. */
export const maxDuration = 120;

/** What a student may type. Bounded before it reaches a prompt. */
const MAX_ASK_CHARS = 400;

export async function GET() {
  // Availability and entitlement, separately — same contract as the other AI
  // probes. An unconfigured deployment hides the feature; an unsubscribed user
  // on a working one sees a lock and a price.
  let pro = false;
  try {
    const { proAccess } = await import("@/lib/auth/pro");
    pro = (await proAccess()).isPro;
  } catch {
    /* not signed in — not an error for a capability probe */
  }
  return NextResponse.json({ enabled: webSearchEnabled(), pro });
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const access = await requirePro("discover");
    userId = access.user.id;
  } catch (err) {
    const paid = proRequiredResponse(err);
    if (paid) return paid;
    const res = authErrorResponse(err);
    if (res) return res;
    throw err;
  }

  if (!webSearchEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Shares the agent's budget. A discovery run costs more than a chat turn,
  // but one counter that bounds all model spend per user beats two that each
  // bound half of it.
  const limit = checkRateLimit(`sb:${userId}`);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let ask = "";
  try {
    const body = (await req.json().catch(() => ({}))) as { ask?: unknown };
    if (typeof body.ask === "string") ask = body.ask.slice(0, MAX_ASK_CHARS);
  } catch {
    /* an empty body is fine — the profile alone is a valid search */
  }

  // Read through the CALLER'S session. RLS on `profiles` is own-row-only, so
  // this cannot be pointed at somebody else's profile by any means.
  const sb = await supabaseServer();
  const { data: profile } = await sb
    .from("profiles")
    .select("department, year, skills, preferred_locations, preferred_work_modes")
    .maybeSingle();

  if (!profile) {
    // Discovery is "find things for ME". Without a profile there is no "me",
    // and a generic search would be worse than saying so.
    return NextResponse.json({ error: "profile_required" }, { status: 409 });
  }

  // ── search ────────────────────────────────────────────────────────────
  let raw: string;
  let provider: string;
  try {
    const result = await searchWeb(
      buildDiscoveryPrompt(profile as unknown as Profile, ask),
      { system: SYSTEM_PROMPT, maxTokens: 4096 }
    );
    raw = result.text;
    provider = result.provider;
  } catch (e) {
    if (e instanceof AgentNotConfiguredError) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    console.error("[discover] search failed", (e as Error).message);
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }

  // ── parse ─────────────────────────────────────────────────────────────
  const parsed = parseDiscovery(raw);
  if (parsed.unparseable) {
    // Distinct from "found nothing". This is a broken prompt or a changed
    // provider response shape, and reporting it as zero results would hide a
    // fault that needs fixing.
    console.error("[discover] unparseable reply", raw.slice(0, 400));
    return NextResponse.json({ error: "unparseable_response" }, { status: 502 });
  }

  // ── verify: the gate ──────────────────────────────────────────────────
  const { verified, rejected } = await verifyCandidates(parsed.candidates);

  // ── de-duplicate against what Shuru already has ───────────────────────
  // Service role: the check must see rows this student cannot, or every
  // pending listing awaiting moderation would be re-discovered on every run.
  const db = supabaseServiceRole();
  const urls = verified.map((v) => v.resolved_url);
  const fresh: VerifiedCandidate[] = [];

  if (urls.length > 0) {
    const { data: existing } = await db
      .from("opportunities")
      .select("apply_url")
      .in("apply_url", urls);

    const seen = new Set((existing ?? []).map((r) => r.apply_url as string));
    for (const v of verified) {
      if (!seen.has(v.resolved_url)) fresh.push(v);
    }
  }

  // ── insert as pending ─────────────────────────────────────────────────
  let inserted = 0;
  if (fresh.length > 0) {
    const now = new Date();
    const rows = fresh.map((v) => {
      // A stated deadline is used as stated. An absent one becomes a rolling
      // window, exactly as every board adapter does it — `deadline` is NOT
      // NULL in the schema, and `deadline_is_rolling` is what stops the UI
      // printing a date the posting never gave.
      const stated = v.deadline;
      const rollingEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      return {
        company: v.company,
        role: v.role,
        location: v.location ?? "Not specified",
        duration: v.duration ?? "Not specified",
        deadline: stated ?? rollingEnd,
        deadline_is_rolling: !stated,
        cycle_label: stated ? "Found on the web" : "Rolling · found on the web",
        // Never inferred. `is_paid` false plus `compensation_stated` false is
        // the schema's way of saying "the posting did not say", which is not
        // the same as "unpaid" — see the note on Opportunity in lib/types.
        is_paid: false,
        compensation_stated: Boolean(v.stipend_text),
        stipend_text: v.stipend_text,
        work_mode: v.work_mode ?? "onsite",
        description: v.description,
        requirements: v.requirements,
        apply_url: v.resolved_url,
        source_url: v.resolved_url,
        source: "ai",
        source_ref: v.resolved_url,
        // The two that matter. `pending` puts it in the admin queue;
        // `is_verified` false is about the EMPLOYER being verified, which
        // nothing here establishes.
        status: "pending",
        is_verified: false,
        // No eligibility rules are invented. The match engine then abstains
        // on this listing exactly as ADR 0002 requires, rather than scoring it
        // against criteria nobody published.
        eligibility_rules: {},
      };
    });

    const { data, error } = await db
      .from("opportunities")
      .insert(rows)
      .select("id");

    if (error) {
      console.error("[discover] insert failed", error.message);
      // The student still gets their verified links — those are useful whether
      // or not Shuru managed to record them.
      return NextResponse.json({
        provider,
        results: fresh,
        inserted: 0,
        duplicates: verified.length - fresh.length,
        rejected: rejected.map((r) => ({ reason: r.reason, company: r.candidate.company })),
        warning: "found_but_not_recorded",
      });
    }
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({
    provider,
    /** Verified and safe to show: every URL was fetched and read. */
    results: fresh,
    /** Already in Shuru, so not inserted again — still shown to the student. */
    duplicates: verified.length - fresh.length,
    /** Queued for moderation. They reach the shared feed only after approval. */
    inserted,
    /** Why candidates died. Surfaced, never hidden. */
    rejected: rejected.map((r) => ({
      reason: r.reason,
      company: r.candidate.company,
      role: r.candidate.role,
    })),
    dropped_unparseable_rows: parsed.dropped,
  });
}
