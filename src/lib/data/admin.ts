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
