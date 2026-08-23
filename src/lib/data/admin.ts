"use client";

/**
 * ADMIN DATA LAYER
 *
 * Every write here is admin-gated in the database, not by this module:
 * `guard_opportunity_moderation` silently reverts moderation columns for a
 * non-admin, and `guard_company_verification` does the same for verification.
 * That means an unauthorised caller sees a *successful* write that changed
 * nothing — so these helpers re-read the row and report what actually landed
 * rather than assuming the update took.
 *
 * `admin_audit_log` is append-only and written by trigger; 0007/0009 revoke
 * INSERT/UPDATE/DELETE from `authenticated` so it cannot be forged here.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AdminAuditEntry,
  Company,
  IngestionRun,
  ListingReport,
  ListingStatus,
  Opportunity,
} from "@/lib/types";

export class ModerationRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationRejected";
  }
}

// ── listing moderation ──────────────────────────────────────────
export async function listListingsByStatus(
  status: ListingStatus
): Promise<Opportunity[]> {
  const { data, error } = await supabaseBrowser()
    .from("opportunities")
    .select("*")
    .eq("status", status)
    .order("first_seen_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}

/**
 * Approve or reject a listing.
 *
 * The re-read is the point: a non-admin's update succeeds at the API level
 * and is reverted by the guard trigger, so trusting the 200 would show a
 * moderator a decision that never happened.
 */
export async function moderateListing(
  id: string,
  status: Extract<ListingStatus, "approved" | "rejected">,
  reason?: string
): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb
    .from("opportunities")
    .update({
      status,
      rejection_reason: status === "rejected" ? (reason ?? null) : null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  const { data, error: readError } = await sb
    .from("opportunities")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;

  if (data?.status !== status) {
    throw new ModerationRejected(
      "The database did not accept that change — this action requires an admin role."
    );
  }
}

/**
 * Adds a listing an admin knows about but no source publishes.
 *
 * This is the only route by which a Bangladeshi internship reaches the
 * platform today. No BD job board offers a public API, and the major
 * employers (Robi, Grameenphone, bKash, Brac Bank) run custom career pages
 * with no ATS behind them — verified, not assumed. So scraping yields remote
 * roles only, and local listings are curated by hand.
 *
 * `company_id` is deliberately null: the employer has not onboarded, and
 * inventing a `companies` row would put an unverified organisation in the
 * employer directory as though it had signed up. `source` is 'shuru', which
 * also protects the row — /api/ingest never touches non-ingested listings, so
 * a refresh cannot overwrite or expire it.
 *
 * `guard_opportunity_insert` lets an admin set status directly; a non-admin's
 * insert is forced back to 'pending', so this cannot be used to self-publish.
 */
export async function createCuratedListing(input: {
  company: string;
  role: string;
  location: string;
  duration: string;
  deadline: string;
  work_mode: Opportunity["work_mode"];
  is_paid: boolean;
  apply_url: string | null;
  skills_required: string[];
  min_cgpa: number | null;
  min_semester: number | null;
  notes: string | null;
}): Promise<Opportunity> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await sb
    .from("opportunities")
    .insert({
      company: input.company.trim(),
      role: input.role.trim(),
      location: input.location.trim(),
      duration: input.duration.trim() || "Not specified",
      deadline: input.deadline,
      work_mode: input.work_mode,
      is_paid: input.is_paid,
      // The admin read the posting, so compensation state is a stated fact.
      compensation_stated: true,
      apply_url: input.apply_url,
      source_url: input.apply_url,
      skills_required: input.skills_required,
      eligibility_rules: {
        min_cgpa: input.min_cgpa,
        min_semester: input.min_semester,
        allowed_departments: null,
        other_text: input.notes,
      },
      source: "shuru",
      company_id: null,
      posted_by: user.id,
      status: "approved",
      is_verified: true,
      cycle_label: String(new Date(input.deadline).getFullYear()),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Opportunity;
}

// ── company verification ────────────────────────────────────────
export async function listCompaniesByVerification(
  status: Company["verification_status"]
): Promise<Company[]> {
  const { data, error } = await supabaseBrowser()
    .from("companies")
    .select("*")
    .eq("verification_status", status)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Company[];
}

export async function verifyCompany(
  id: string,
  status: Company["verification_status"],
  notes?: string
): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb
    .from("companies")
    .update({ verification_status: status, verification_notes: notes ?? null })
    .eq("id", id);
  if (error) throw error;

  const { data } = await sb
    .from("companies")
    .select("verification_status")
    .eq("id", id)
    .maybeSingle();

  if (data?.verification_status !== status) {
    throw new ModerationRejected(
      "The database did not accept that change — this action requires an admin role."
    );
  }
}

// ── listing reports ─────────────────────────────────────────────
export async function listOpenReports(): Promise<ListingReport[]> {
  const { data, error } = await supabaseBrowser()
    .from("listing_reports")
    .select("*")
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ListingReport[];
}

export async function resolveReport(
  id: string,
  status: Extract<ListingReport["status"], "actioned" | "dismissed">,
  note?: string
): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("listing_reports")
    .update({ status, resolution_note: note ?? null })
    .eq("id", id);
  if (error) throw error;
}

// ── observability ───────────────────────────────────────────────
export async function listIngestionRuns(limit = 50): Promise<IngestionRun[]> {
  const { data, error } = await supabaseBrowser()
    .from("ingestion_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as IngestionRun[];
}

export async function listAuditLog(limit = 50): Promise<AdminAuditEntry[]> {
  const { data, error } = await supabaseBrowser()
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AdminAuditEntry[];
}
