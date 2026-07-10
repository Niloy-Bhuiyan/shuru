-- ════════════════════════════════════════════════════════════════
-- SHURU — migration: Resume Forge
-- Run this ONCE in the SQL Editor of an EXISTING Supabase project
-- (fresh installs get the same table from schema.sql — don't run both).
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
