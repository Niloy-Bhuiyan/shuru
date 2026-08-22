"use client";

/**
 * DATA LAYER — the only module screens talk to.
 *
 * Every read and write goes to Postgres through Supabase, scoped by Row
 * Level Security. There is no local fallback: if the database is not
 * configured the app says so (see ConfigRequired) rather than simulating
 * one, so a screen showing data always means the data is real.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import { SEED_OPPORTUNITIES } from "./seed";
import type {
  Application,
  ApplicationStatus,
  InterviewReport,
  Mentor,
  Opportunity,
  Outcome,
  Profile,
  Resume,
  ResumeContent,
} from "@/lib/types";
import { emptyResumeContent } from "@/lib/types";

// ── sample-data flag ────────────────────────────────────────────
/**
 * True when an opportunity came from supabase/seed.sql. The outcome history
 * behind a seeded row is illustrative, not observed, so any Reality Check
 * number computed from it must be labelled as sample data. Real listings
 * carry real outcomes or none at all — in which case Reality Check abstains.
 */
const SEED_OPPORTUNITY_IDS = new Set(SEED_OPPORTUNITIES.map((o) => o.id));
export function isSeededOpportunity(id: string): boolean {
  return SEED_OPPORTUNITY_IDS.has(id);
}

export async function listOpportunities(): Promise<Opportunity[]> {
  const { data, error } = await supabaseBrowser()
    .from("opportunities")
    .select("*")
    .order("deadline", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const { data, error } = await supabaseBrowser()
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Opportunity) ?? null;
}

// ── outcomes (Reality Check fuel) ───────────────────────────────
export async function listOutcomes(opportunityId: string): Promise<Outcome[]> {
  const { data, error } = await supabaseBrowser()
    .from("outcomes")
    .select("*")
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
  return (data ?? []) as Outcome[];
}

/**
 * Batched outcomes lookup for many opportunities at once — one query instead
 * of one-per-listing (fixes the Radar N+1, see 1.8). Returns a map keyed by
 * opportunity id; every requested id is present (empty array when none).
 */
export async function listOutcomesForOpportunities(
  ids: string[]
): Promise<Record<string, Outcome[]>> {
  const grouped: Record<string, Outcome[]> = {};
  for (const id of ids) grouped[id] = [];
  if (ids.length === 0) return grouped;

  const { data, error } = await supabaseBrowser()
    .from("outcomes")
    .select("*")
    .in("opportunity_id", ids);
  if (error) throw error;
  for (const o of (data ?? []) as Outcome[]) {
    (grouped[o.opportunity_id] ??= []).push(o);
  }
  return grouped;
}

// ── interview reports ───────────────────────────────────────────
export async function listInterviewReports(
  company?: string
): Promise<InterviewReport[]> {
  let q = supabaseBrowser().from("interview_reports").select("*");
  if (company) q = q.eq("company", company);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as InterviewReport[];
}

// ── mentors ─────────────────────────────────────────────────────
export async function listMentors(filter?: {
  university?: string;
  company?: string;
}): Promise<Mentor[]> {
  let q = supabaseBrowser().from("mentors").select("*").eq("opt_in", true);
  if (filter?.university) q = q.eq("university", filter.university);
  if (filter?.company) q = q.eq("company", filter.company);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Mentor[];
}

/** Count of seniors from a university who interned at a company. */
export async function countSeniors(
  university: string,
  company: string
): Promise<number> {
  const mentors = await listMentors({ university, company });
  return mentors.length;
}

/**
 * Batched senior counts for many companies at once — one query instead of
 * one-per-company (fixes the Radar N+1, see 1.8). Returns a map keyed by
 * company; every requested company is present (0 when none).
 */
export async function countSeniorsByCompany(
  university: string,
  companies: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const c of companies) counts[c] = 0;
  if (companies.length === 0) return counts;

  const { data, error } = await supabaseBrowser()
    .from("mentors")
    .select("company")
    .eq("opt_in", true)
    .eq("university", university)
    .in("company", companies);
  if (error) throw error;
  for (const m of (data ?? []) as { company: string }[]) {
    if (counts[m.company] !== undefined) counts[m.company] += 1;
  }
  return counts;
}

// ── profile ─────────────────────────────────────────────────────
export async function getProfile(): Promise<Profile | null> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, cgpa: Number(data.cgpa) } as Profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("profiles")
    .upsert(profile, { onConflict: "user_id" });
  if (error) throw error;
}

// ── applications (the tracker) ──────────────────────────────────
export async function listApplications(): Promise<Application[]> {
  const { data, error } = await supabaseBrowser()
    .from("applications")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Application[];
}

export async function upsertApplication(
  opportunityId: string,
  status: ApplicationStatus
): Promise<void> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await sb.from("applications").upsert(
    {
      user_id: user.id,
      opportunity_id: opportunityId,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,opportunity_id" }
  );
  if (error) throw error;
}

export async function removeApplication(opportunityId: string): Promise<void> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await sb
    .from("applications")
    .delete()
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
}

// ── resumes (Resume Forge) ──────────────────────────────────────
/** Latest resume for this user, or null if none saved yet. */
export async function getResume(): Promise<Resume | null> {
  const { data, error } = await supabaseBrowser()
    .from("resumes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Resume) ?? null;
}

/** Upsert the user's resume (single-resume MVP; table supports many). */
export async function saveResume(
  content: ResumeContent,
  title = "My Resume"
): Promise<Resume> {
  const now = new Date().toISOString();
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const existing = await getResume();
  if (existing) {
    const { data, error } = await sb
      .from("resumes")
      .update({ title, content, updated_at: now })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as Resume;
  }
  const { data, error } = await sb
    .from("resumes")
    .insert({ user_id: user.id, title, content, updated_at: now })
    .select()
    .single();
  if (error) throw error;
  return data as Resume;
}

/** A sensible starting resume pre-filled from the profile. */
export function resumeFromProfile(p: Profile): ResumeContent {
  return {
    ...emptyResumeContent(),
    contact: { name: p.name, email: "", phone: "", location: "Dhaka, Bangladesh", links: [] },
    education: [
      {
        institution: p.university,
        degree: `BSc in ${p.department}`,
        start: "",
        end: "",
        notes: `CGPA ${p.cgpa.toFixed(2)}/4.00`,
      },
    ],
    skills: [...p.skills],
  };
}
