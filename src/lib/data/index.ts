"use client";

/**
 * DATA LAYER — the only module screens talk to.
 *
 * Two backends behind one API:
 *  - DEMO MODE (no Supabase keys set): reads the bundled seed data and keeps
 *    profile + applications in localStorage. The whole app works OFFLINE.
 *  - SUPABASE MODE (keys present in .env.local): real tables, real auth.
 *
 * Switch is automatic — fill .env.local and restart, nothing else changes.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import {
  SEED_MENTORS,
  SEED_OPPORTUNITIES,
  SEED_OUTCOMES,
  SEED_REPORTS,
} from "./seed";
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
import { isDemoMode } from "@/lib/demoMode";

// ── mode detection ──────────────────────────────────────────────
// isDemoMode lives in a server-safe module (not this "use client" file) so
// server routes can import it without getting a client-reference stub. Kept
// re-exported here so existing `@/lib/data` importers are unaffected.
export { isDemoMode };

// ── localStorage helpers (demo mode) ────────────────────────────
const LS_PROFILE = "shuru.demo.profile";
const LS_APPS = "shuru.demo.applications";

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ── opportunities ───────────────────────────────────────────────
const LS_INGESTED = "shuru.demo.ingested";

/** demo-mode ingested rows (from /api/ingest), stored client-side */
function getIngested(): Opportunity[] {
  return lsGet<Opportunity[]>(LS_INGESTED, []);
}

/** merge curated seed with ingested rows; curated always wins on id clash */
function demoOpportunities(): Opportunity[] {
  const seedIds = new Set(SEED_OPPORTUNITIES.map((o) => o.id));
  const extra = getIngested().filter((o) => !seedIds.has(o.id));
  return [...SEED_OPPORTUNITIES, ...extra];
}

/**
 * True when an opportunity is a curated SEED row. Any Reality Check number
 * for a seeded row is driven by fabricated SEED_OUTCOMES, so the UI must
 * flag it as illustrative sample data (see 1.2). Ingested rows are NOT
 * seeded and carry zero outcomes, so they abstain rather than show a number.
 */
const SEED_OPPORTUNITY_IDS = new Set(SEED_OPPORTUNITIES.map((o) => o.id));
export function isSeededOpportunity(id: string): boolean {
  return SEED_OPPORTUNITY_IDS.has(id);
}

/** Store accepted ingested rows (upsert by id). Returns the new count. */
export function mergeIngested(rows: Opportunity[]): number {
  const byId = new Map(getIngested().map((o) => [o.id, o]));
  for (const r of rows) byId.set(r.id, r);
  const merged = Array.from(byId.values());
  lsSet(LS_INGESTED, merged);
  return merged.length;
}

export async function listOpportunities(): Promise<Opportunity[]> {
  if (isDemoMode()) {
    return demoOpportunities().sort((a, b) => a.deadline.localeCompare(b.deadline));
  }
  const { data, error } = await supabaseBrowser()
    .from("opportunities")
    .select("*")
    .order("deadline", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Opportunity[];
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  if (isDemoMode()) {
    return demoOpportunities().find((o) => o.id === id) ?? null;
  }
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
  if (isDemoMode()) {
    return SEED_OUTCOMES.filter((o) => o.opportunity_id === opportunityId);
  }
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

  if (isDemoMode()) {
    for (const o of SEED_OUTCOMES) {
      if (grouped[o.opportunity_id]) grouped[o.opportunity_id].push(o);
    }
    return grouped;
  }
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
  if (isDemoMode()) {
    return company
      ? SEED_REPORTS.filter((r) => r.company === company)
      : SEED_REPORTS;
  }
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
  if (isDemoMode()) {
    return SEED_MENTORS.filter(
      (m) =>
        m.opt_in &&
        (!filter?.university || m.university === filter.university) &&
        (!filter?.company || m.company === filter.company)
    );
  }
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

  if (isDemoMode()) {
    for (const m of SEED_MENTORS) {
      if (m.opt_in && m.university === university && counts[m.company] !== undefined) {
        counts[m.company] += 1;
      }
    }
    return counts;
  }
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
  if (isDemoMode()) {
    return lsGet<Profile | null>(LS_PROFILE, null);
  }
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
  if (isDemoMode()) {
    lsSet(LS_PROFILE, profile);
    return;
  }
  const { error } = await supabaseBrowser()
    .from("profiles")
    .upsert(profile, { onConflict: "user_id" });
  if (error) throw error;
}

// ── applications (the tracker) ──────────────────────────────────
export async function listApplications(): Promise<Application[]> {
  if (isDemoMode()) {
    return lsGet<Application[]>(LS_APPS, []);
  }
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
  if (isDemoMode()) {
    const apps = lsGet<Application[]>(LS_APPS, []);
    const existing = apps.find((a) => a.opportunity_id === opportunityId);
    const now = new Date().toISOString();
    if (existing) {
      existing.status = status;
      existing.updated_at = now;
    } else {
      apps.push({
        id: `local-${Date.now()}`,
        user_id: "demo",
        opportunity_id: opportunityId,
        status,
        updated_at: now,
      });
    }
    lsSet(LS_APPS, apps);
    return;
  }
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
  if (isDemoMode()) {
    const apps = lsGet<Application[]>(LS_APPS, []).filter(
      (a) => a.opportunity_id !== opportunityId
    );
    lsSet(LS_APPS, apps);
    return;
  }
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
const LS_RESUME = "shuru.demo.resume";

/** Latest resume for this user, or null if none saved yet. */
export async function getResume(): Promise<Resume | null> {
  if (isDemoMode()) {
    return lsGet<Resume | null>(LS_RESUME, null);
  }
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
  if (isDemoMode()) {
    const existing = lsGet<Resume | null>(LS_RESUME, null);
    const resume: Resume = {
      id: existing?.id ?? "local-resume",
      user_id: "demo",
      title,
      content,
      updated_at: now,
    };
    lsSet(LS_RESUME, resume);
    return resume;
  }
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
