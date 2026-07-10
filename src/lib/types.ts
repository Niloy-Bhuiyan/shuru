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
};

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "interview"
  | "offer"
  | "rejected";

export type Application = {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: ApplicationStatus;
  updated_at: string;
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
