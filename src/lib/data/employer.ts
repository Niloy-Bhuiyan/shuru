"use client";

/**
 * EMPLOYER DATA LAYER
 *
 * Every query here is deliberately unfiltered by company: RLS (0002/0004)
 * already restricts each row to the caller's `employer_members` rows, so
 * adding a client-side company filter would duplicate the boundary without
 * strengthening it. Where a company id IS passed, it narrows a result the
 * caller already has access to — it is never the thing enforcing access.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  Application,
  ApplicationEvent,
  ApplicationStatus,
  Company,
  EmployerMember,
  Opportunity,
  Profile,
} from "@/lib/types";
import { EMPLOYER_SET_STATUSES } from "@/lib/types";

/** An applicant row as the pipeline board needs it: the application plus context. */
export type ApplicantRow = {
  application: Application;
  opportunity: Pick<Opportunity, "id" | "role" | "company" | "deadline">;
  /** Null when the applicant has not completed a profile yet. */
  profile: Pick<
    Profile,
    "user_id" | "name" | "university" | "department" | "year" | "cgpa" | "skills"
  > | null;
};

/**
 * The company this user belongs to, or null if they are not an employer member.
 * Employer accounts are single-company here; the membership table supports
 * more, but nothing in the product asks for a company switcher yet.
 */
export async function getMyCompany(): Promise<Company | null> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data: membership, error: mErr } = await sb
    .from("employer_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!membership) return null;

  const { data, error } = await sb
    .from("companies")
    .select("*")
    .eq("id", membership.company_id)
    .maybeSingle();
  if (error) throw error;
  return (data as Company) ?? null;
}

export async function getMyMembership(): Promise<EmployerMember | null> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("employer_members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as EmployerMember) ?? null;
}

/**
 * Creates the company and makes the caller its owner.
 *
 * Not a transaction: PostgREST has no multi-statement call, so a failure
 * between the two writes would leave a company with no members. The company
 * row records `created_by`, so such an orphan is recoverable rather than
 * lost, and the membership insert is retried on the next call by
 * `ensureOwnerMembership`.
 */
export async function createCompany(input: {
  name: string;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  size_label?: string | null;
  location?: string | null;
}): Promise<Company> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await sb
    .from("companies")
    .insert({ ...input, created_by: user.id })
    .select("*")
    .single();
  if (error) throw error;

  const company = data as Company;
  await ensureOwnerMembership(company.id);
  return company;
}

/** Idempotent: re-running after a partial createCompany completes the pair. */
export async function ensureOwnerMembership(companyId: string): Promise<void> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await sb
    .from("employer_members")
    .upsert(
      { user_id: user.id, company_id: companyId, is_owner: true },
      { onConflict: "user_id,company_id" }
    );
  if (error) throw error;
}

/**
 * Company profile edits. `verification_status` is deliberately not accepted —
 * it is admin-owned and guarded by `guard_company_verification`, so allowing
 * it here would only produce a confusing silent no-op.
 */
export async function updateCompany(
  id: string,
  patch: Partial<
    Pick<
      Company,
      "name" | "website" | "description" | "industry" | "size_label" | "location" | "logo_url"
    >
  >
): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("companies")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

// ── listings ────────────────────────────────────────────────────
export async function listCompanyListings(
  companyId: string
): Promise<Opportunity[]> {
  const { data, error } = await supabaseBrowser()
    .from("opportunities")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}

/**
 * New listings always enter as `pending`; `guard_opportunity_insert` rejects
 * anything else from a non-admin, so setting the status here would be a
 * client-side lie about what the database will store.
 */
export async function createListing(
  companyId: string,
  input: Partial<Opportunity> & Pick<Opportunity, "role" | "company">
): Promise<Opportunity> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await sb
    .from("opportunities")
    .insert({
      ...input,
      company_id: companyId,
      posted_by: user.id,
      source: "shuru",
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Opportunity;
}

export async function updateListing(
  id: string,
  patch: Partial<Opportunity>
): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("opportunities")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

// ── applicant pipeline ──────────────────────────────────────────
/**
 * Applicants across every listing this employer can see.
 *
 * Three queries rather than one embedded join: `applications` has no foreign
 * key to `profiles` (both reference auth.users), so PostgREST cannot embed
 * the applicant. Fetching profiles by the id set keeps it at a fixed three
 * round-trips instead of one per applicant.
 */
export async function listCompanyApplicants(
  companyId: string
): Promise<ApplicantRow[]> {
  const sb = supabaseBrowser();

  const { data: listings, error: lErr } = await sb
    .from("opportunities")
    .select("id, role, company, deadline")
    .eq("company_id", companyId);
  if (lErr) throw lErr;

  const byId = new Map(
    ((listings ?? []) as ApplicantRow["opportunity"][]).map((o) => [o.id, o])
  );
  if (byId.size === 0) return [];

  const { data: apps, error: aErr } = await sb
    .from("applications")
    .select("*")
    .in("opportunity_id", Array.from(byId.keys()))
    .order("updated_at", { ascending: false });
  if (aErr) throw aErr;

  const applications = (apps ?? []) as Application[];
  if (applications.length === 0) return [];

  const userIds = Array.from(new Set(applications.map((a) => a.user_id)));
  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("user_id, name, university, department, year, cgpa, skills")
    .in("user_id", userIds);
  if (pErr) throw pErr;

  const profileById = new Map(
    ((profiles ?? []) as ApplicantRow["profile"][]).map((p) => [p!.user_id, p])
  );

  return applications.map((application) => ({
    application,
    opportunity: byId.get(application.opportunity_id)!,
    profile: profileById.get(application.user_id) ?? null,
  }));
}

/**
 * Moves an application along the pipeline.
 *
 * Restricted to the employer-settable states: `guard_application_transition`
 * rejects the rest, and the applicant is notified by trigger
 * (`notify_application_status`) — nothing needs to be sent from here.
 */
export async function setApplicationStatus(
  applicationId: string,
  status: (typeof EMPLOYER_SET_STATUSES)[number]
): Promise<void> {
  if (!EMPLOYER_SET_STATUSES.includes(status)) {
    throw new Error(`${status} is not an employer-settable status`);
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "viewed") patch.viewed_at = new Date().toISOString();

  const { error } = await supabaseBrowser()
    .from("applications")
    .update(patch)
    .eq("id", applicationId);
  if (error) throw error;
}

// Application history lives in ./applications — it is read by students and
// employers alike, so it does not belong behind the employer module.
export { listApplicationEvents } from "./applications";

/** Counts per pipeline stage, for the board header. */
export function summarisePipeline(
  rows: ApplicantRow[]
): Record<ApplicationStatus, number> {
  const counts = {
    saved: 0,
    applied: 0,
    viewed: 0,
    shortlisted: 0,
    interview: 0,
    accepted: 0,
    rejected: 0,
  } satisfies Record<ApplicationStatus, number>;

  for (const r of rows) counts[r.application.status] += 1;
  return counts;
}
