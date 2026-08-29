/** Shared row types — mirror of supabase/schema.sql. */

export type Lang = "en" | "bn";

export type Profile = {
  user_id: string;
  name: string;
  university: string;
  department: string;
  /** Current semester of study, 1–12. */
  year: number;
  cgpa: number;
  skills: string[];
  has_deployed_project: boolean;
  language_pref: Lang;
  /** Work preferences — used by the matching engine, absent on older rows. */
  preferred_locations?: string[];
  preferred_work_modes?: WorkMode[];
  available_from?: string | null;
  /** Storage path of the uploaded CV, under the private `resumes` bucket. */
  cv_path?: string | null;
  cv_uploaded_at?: string | null;
};

export type EligibilityRules = {
  min_cgpa?: number | null;
  min_semester?: number | null;
  allowed_departments?: string[] | null;
  other_text?: string | null;
};

export type Opportunity = {
  id: string;
  company: string;
  role: string;
  location: string;
  duration: string;
  is_paid: boolean;
  /** ISO date, e.g. "2026-07-20" */
  deadline: string;
  eligibility_rules: EligibilityRules;
  source_url: string | null;
  is_verified: boolean;
  cycle_label: string;

  // ── lifecycle (0003) — optional because seed rows predate these ──
  status?: ListingStatus;
  company_id?: string | null;
  posted_by?: string | null;
  rejection_reason?: string | null;
  requested_changes?: string | null;

  /** Which board this listing came from. 'shuru' = posted in-product. */
  source?: InternshipSource;
  /** The listing's id at its source; null for in-product postings. */
  source_ref?: string | null;
  apply_url?: string | null;

  description?: string | null;
  requirements?: string | null;
  skills_required?: string[];
  work_mode?: WorkMode;

  /**
   * Whether the source made any compensation claim at all. `is_paid` alone
   * cannot separate "unpaid" from "not stated", so both are carried.
   */
  compensation_stated?: boolean;
  stipend_text?: string | null;

  first_seen_at?: string;
  last_verified_at?: string;
  expires_at?: string | null;
  /**
   * Set ONLY by the payments webhook (see migration 0014's guard trigger).
   * A listing is promoted while this is in the future. Promoted listings are
   * shown in their own labelled section, never mixed into the ranked feed.
   */
  featured_until?: string | null;
  /** Source publishes no real closing date — show "Rolling", never a fake one. */
  deadline_is_rolling?: boolean;
};

export type ListingStatus = "pending" | "approved" | "rejected" | "expired";

export type WorkMode = "onsite" | "remote" | "hybrid";

export type InternshipSource =
  | "shuru"
  | "remoteok"
  | "arbeitnow"
  | "lever"
  | "ashby"
  | "adzuna"
  /**
   * Found by searching the live web (migration 0019, ADR 0004). Its
   * `apply_url` was fetched server-side and confirmed to be a page naming this
   * company and this role before the row was written, and it still passed
   * through admin moderation like any other pending listing.
   */
  | "ai";

/**
 * 'saved' is the bookmark state that precedes the pipeline. The pipeline
 * proper is Applied -> Viewed -> Shortlisted -> Interview -> Accepted/Rejected.
 * Everything from 'viewed' onward is the employer's decision to make.
 */
export type ApplicationStatus =
  | "saved"
  | "applied"
  | "viewed"
  | "shortlisted"
  | "interview"
  | "accepted"
  | "rejected";

/** The states only an employer may set. Mirrors the database guard trigger. */
export const EMPLOYER_SET_STATUSES = [
  "viewed",
  "shortlisted",
  "interview",
  "accepted",
  "rejected",
] as const satisfies readonly ApplicationStatus[];

export type Application = {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: ApplicationStatus;
  updated_at: string;
  created_at?: string;
  applied_at?: string | null;
  viewed_at?: string | null;
  cover_note?: string | null;
  resume_id?: string | null;
  /** Match score as it stood at submission, so later edits don't rewrite it. */
  match_score?: number | null;
  match_snapshot?: unknown;
};

/** Append-only history row. Written by a database trigger, never by clients. */
export type ApplicationEvent = {
  id: string;
  application_id: string;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  actor_id: string | null;
  actor_role: UserRole | null;
  note: string | null;
  created_at: string;
};

export type OutcomeResult = "shortlisted" | "rejected" | "offer";

export type ProfileSnapshot = {
  cgpa: number;
  dept: string;
  /** semester at time of applying */
  year: number;
  has_projects: boolean;
  has_deployed_project: boolean;
};

export type Outcome = {
  id: string;
  opportunity_id: string;
  profile_snapshot: ProfileSnapshot;
  result: OutcomeResult;
  cycle: string;
};

export type InterviewRound = {
  name: string;
  format?: string;
  notes?: string;
};

export type InterviewReport = {
  id: string;
  company: string;
  role: string;
  rounds: InterviewRound[];
  question_types: string[];
  /** 1 (easy) – 5 (brutal) */
  difficulty: number;
  apply_to_offer_days: number;
  author_anon: string;
};

export type Mentor = {
  id: string;
  user_id: string | null;
  name_display: string;
  company: string;
  university: string;
  offers: ("cv_review" | "intro")[];
  opt_in: boolean;
};

// ── Resume Forge ────────────────────────────────────────────────
export type ResumeSectionKey =
  | "contact"
  | "summary"
  | "education"
  | "experience"
  | "projects"
  | "skills";

export type ResumeContact = {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
};

export type ResumeEducation = {
  institution: string;
  degree: string;
  start: string;
  end: string;
  notes: string;
};

export type ResumeExperience = {
  company: string;
  role: string;
  start: string;
  end: string;
  bullets: string[];
};

export type ResumeProject = {
  name: string;
  link: string;
  tech: string;
  bullets: string[];
};

export type ResumeContent = {
  /** display order of sections in the editor + rendered resume */
  order: ResumeSectionKey[];
  contact: ResumeContact;
  summary: string;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: string[];
};

export type Resume = {
  id: string;
  user_id: string;
  title: string;
  content: ResumeContent;
  updated_at: string;
};

export function emptyResumeContent(): ResumeContent {
  return {
    order: ["contact", "summary", "education", "experience", "projects", "skills"],
    contact: { name: "", email: "", phone: "", location: "", links: [] },
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
  };
}

// ── Roles + employers (0002) ────────────────────────────────────
export type UserRole = "student" | "employer" | "admin";

export type CompanyVerificationStatus = "pending" | "approved" | "rejected";

export type Company = {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  industry: string | null;
  size_label: string | null;
  location: string | null;
  verification_status: CompanyVerificationStatus;
  verification_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployerMember = {
  user_id: string;
  company_id: string;
  title: string | null;
  is_owner: boolean;
};

// ── Notifications (0005) ────────────────────────────────────────
export type NotificationType =
  | "new_match"
  | "urgent_internship"
  | "saved_closing_soon"
  | "application_viewed"
  | "application_shortlisted"
  | "application_interview"
  | "application_rejected"
  | "application_accepted"
  | "application_update"
  | "listing_status"
  | "company_status";

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  /** 0–100: match quality x deadline proximity x freshness. */
  priority: number;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
  /**
   * Per-channel delivery stamps. Null means that channel has not run —
   * never assume a notification was emailed or pushed because it exists.
   */
  emailed_at: string | null;
  pushed_at: string | null;
};

export type NotificationPreferences = {
  user_id: string;
  in_app: boolean;
  email: boolean;
  browser_push: boolean;
  min_match_score: number;
  max_alerts_per_day: number;
};

// ── Web Push subscriptions (0010) ───────────────────────────────
export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  /** Push-service URL this device is reachable at. */
  endpoint: string;
  /** Client public key and auth secret, base64url — used to encrypt payloads. */
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
  /**
   * Set when the push service reported the subscription is gone (404/410).
   * Retired rather than deleted, so an unsubscribed device stays
   * distinguishable from one that never subscribed.
   */
  expired_at: string | null;
};

// ── Moderation + ingestion (0006) ───────────────────────────────
export type ReportReason =
  | "fraudulent"
  | "expired"
  | "misleading"
  | "duplicate"
  | "not_an_internship"
  | "offensive"
  | "other";

export type ListingReport = {
  id: string;
  opportunity_id: string;
  reported_by: string | null;
  reason: ReportReason;
  details: string | null;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  resolution_note: string | null;
  created_at: string;
};

export type IngestionRunStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "skipped";

export type IngestionRun = {
  id: string;
  source: InternshipSource;
  started_at: string;
  finished_at: string | null;
  status: IngestionRunStatus;
  fetched: number;
  kept: number;
  inserted: number;
  updated: number;
  expired: number;
  /** Populated when a source was unreachable — surfaced, never swallowed. */
  error: string | null;
  trigger_source: "manual" | "cron";
};

export type AdminAuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: unknown;
  after_state: unknown;
  note: string | null;
  created_at: string;
};
