-- ════════════════════════════════════════════════════════════════
-- SHURU — schema.sql
-- Run this FIRST in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then run seed.sql.
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── profiles ────────────────────────────────────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  university text not null,
  department text not null,
  year int not null check (year between 1 and 12), -- current semester
  cgpa numeric(3, 2) not null check (cgpa >= 0 and cgpa <= 4),
  skills text[] not null default '{}',
  has_deployed_project boolean not null default false,
  language_pref text not null default 'en' check (language_pref in ('en', 'bn')),
  created_at timestamptz not null default now()
);

-- ── opportunities ───────────────────────────────────────────────
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  role text not null,
  location text not null,
  duration text not null,
  is_paid boolean not null default false,
  deadline date not null,
  eligibility_rules jsonb not null default '{}'::jsonb,
  source_url text,
  is_verified boolean not null default false,
  cycle_label text not null
);
create index opportunities_deadline_idx on public.opportunities (deadline);

-- ── applications ────────────────────────────────────────────────
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  status text not null default 'saved'
    check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
create index applications_user_idx on public.applications (user_id);

-- ── outcomes (powers Reality Check) ─────────────────────────────
create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  profile_snapshot jsonb not null,
  result text not null check (result in ('shortlisted', 'rejected', 'offer')),
  cycle text not null
);
create index outcomes_opportunity_idx on public.outcomes (opportunity_id);

-- ── interview_reports ───────────────────────────────────────────
create table public.interview_reports (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  role text not null,
  rounds jsonb not null default '[]'::jsonb,
  question_types text[] not null default '{}',
  difficulty int not null check (difficulty between 1 and 5),
  apply_to_offer_days int not null,
  author_anon text not null
);

-- ── mentors ─────────────────────────────────────────────────────
create table public.mentors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name_display text not null,
  company text not null,
  university text not null,
  offers text[] not null default '{}',
  opt_in boolean not null default true
);

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.opportunities enable row level security;
alter table public.outcomes enable row level security;
alter table public.interview_reports enable row level security;
alter table public.mentors enable row level security;

-- profiles: owner only
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

-- applications: owner only, full CRUD
create policy "applications_select_own" on public.applications
  for select using (auth.uid() = user_id);
create policy "applications_insert_own" on public.applications
  for insert with check (auth.uid() = user_id);
create policy "applications_update_own" on public.applications
  for update using (auth.uid() = user_id);
create policy "applications_delete_own" on public.applications
  for delete using (auth.uid() = user_id);

-- shared read-only tables: any signed-in user can read; writes only via seed/admin
create policy "opportunities_read" on public.opportunities
  for select using (auth.role() = 'authenticated');
create policy "outcomes_read" on public.outcomes
  for select using (auth.role() = 'authenticated');
create policy "interview_reports_read" on public.interview_reports
  for select using (auth.role() = 'authenticated');
create policy "mentors_read" on public.mentors
  for select using (auth.role() = 'authenticated' and opt_in = true);

-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Resume Forge (added after initial release)
-- Fresh installs: this runs as part of schema.sql.
-- Existing databases: run supabase/migration_resume_forge.sql instead.
-- ════════════════════════════════════════════════════════════════

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My Resume',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index resumes_user_idx on public.resumes (user_id);

alter table public.resumes enable row level security;

create policy "resumes_select_own" on public.resumes
  for select using (auth.uid() = user_id);
create policy "resumes_insert_own" on public.resumes
  for insert with check (auth.uid() = user_id);
create policy "resumes_update_own" on public.resumes
  for update using (auth.uid() = user_id);
create policy "resumes_delete_own" on public.resumes
  for delete using (auth.uid() = user_id);
