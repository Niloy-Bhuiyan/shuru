-- ════════════════════════════════════════════════════════════════
-- 0006 — Moderation, ingestion bookkeeping, profile fields, CV storage
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── listing reports ─────────────────────────────────────────────
-- Any signed-in user can flag a listing as fraudulent or stale; admins
-- triage the queue.
create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null
    references public.opportunities (id) on delete cascade,
  reported_by uuid references auth.users (id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolution_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.listing_reports
    add constraint listing_reports_reason_check
    check (reason in (
      'fraudulent', 'expired', 'misleading', 'duplicate',
      'not_an_internship', 'offensive', 'other'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists listing_reports_status_idx
  on public.listing_reports (status, created_at desc);
create index if not exists listing_reports_opportunity_idx
  on public.listing_reports (opportunity_id);
-- one open report per user per listing
create unique index if not exists listing_reports_unique_open_idx
  on public.listing_reports (opportunity_id, reported_by)
  where status = 'open';

-- ── admin audit log ─────────────────────────────────────────────
-- Append-only: no update or delete policy exists for anyone, including
-- admins, so the record of who did what cannot be edited away.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id);

-- ── ingestion bookkeeping ───────────────────────────────────────
-- One row per adapter run. Partial failure is recorded, not hidden: a
-- source that was unreachable is visible as an error string rather than
-- silently producing zero listings.
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  fetched int not null default 0,
  kept int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  expired int not null default 0,
  error text,
  trigger_source text not null default 'manual'
    check (trigger_source in ('manual', 'cron'))
);
create index if not exists ingestion_runs_source_idx
  on public.ingestion_runs (source, started_at desc);

-- ── profile fields the matching engine needs ────────────────────
alter table public.profiles
  add column if not exists preferred_locations text[] not null default '{}',
  add column if not exists preferred_work_modes text[] not null default '{}',
  add column if not exists available_from date,
  add column if not exists cv_path text,
  add column if not exists cv_uploaded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table public.listing_reports enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.ingestion_runs enable row level security;

-- reports: reporters see their own, admins see all
drop policy if exists "listing_reports_select" on public.listing_reports;
create policy "listing_reports_select" on public.listing_reports
  for select using (reported_by = auth.uid() or public.is_admin());

drop policy if exists "listing_reports_insert" on public.listing_reports;
create policy "listing_reports_insert" on public.listing_reports
  for insert with check (auth.uid() is not null and reported_by = auth.uid());

drop policy if exists "listing_reports_update_admin" on public.listing_reports;
create policy "listing_reports_update_admin" on public.listing_reports
  for update using (public.is_admin());

-- audit log: admins read; nobody writes through the API. Entries are
-- inserted server-side with the service-role key.
drop policy if exists "admin_audit_log_select" on public.admin_audit_log;
create policy "admin_audit_log_select" on public.admin_audit_log
  for select using (public.is_admin());

-- ingestion runs: admins read; the ingestion job writes with service role
drop policy if exists "ingestion_runs_select" on public.ingestion_runs;
create policy "ingestion_runs_select" on public.ingestion_runs
  for select using (public.is_admin());

-- ════════════════════════════════════════════════════════════════
-- CV storage — private bucket, owner-scoped by path prefix
-- Objects are stored at <user_id>/<filename>, so the first path segment
-- is the owner. Employers read a CV only through an application they own.
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resumes_owner_read" on storage.objects;
create policy "resumes_owner_read" on storage.objects
  for select using (
    bucket_id = 'resumes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "resumes_owner_write" on storage.objects;
create policy "resumes_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_owner_update" on storage.objects;
create policy "resumes_owner_update" on storage.objects
  for update using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_owner_delete" on storage.objects;
create policy "resumes_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
