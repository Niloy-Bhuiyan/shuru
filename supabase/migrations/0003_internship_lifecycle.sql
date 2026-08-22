-- ════════════════════════════════════════════════════════════════
-- 0003 — Internship lifecycle
-- Extends public.opportunities (the internship table) with moderation
-- state, source attribution, freshness tracking and the structured
-- requirement fields the matching engine reads.
--
-- The table keeps its original name: every existing screen, query, seed
-- row and test references `opportunities`, and renaming would be churn
-- with no user-visible benefit. Shuru lists internships only — the
-- internship_only constraint below makes that explicit.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── ownership ───────────────────────────────────────────────────
alter table public.opportunities
  add column if not exists company_id uuid
    references public.companies (id) on delete set null,
  add column if not exists posted_by uuid
    references auth.users (id) on delete set null;

-- ── moderation ──────────────────────────────────────────────────
-- Existing curated rows predate moderation and are already trusted, so the
-- column default approves them; employer submissions are set to 'pending'
-- explicitly by the API.
alter table public.opportunities
  add column if not exists status text not null default 'approved',
  add column if not exists rejection_reason text,
  add column if not exists requested_changes text,
  add column if not exists reviewed_by uuid
    references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

do $$ begin
  alter table public.opportunities
    add constraint opportunities_status_check
    check (status in ('pending', 'approved', 'rejected', 'expired'));
exception when duplicate_object then null;
end $$;

-- ── source attribution ──────────────────────────────────────────
-- 'shuru' = posted in-product by an employer. Everything else names the
-- external board the row came from, so the UI can always say where a
-- listing is from.
alter table public.opportunities
  add column if not exists source text not null default 'shuru',
  add column if not exists source_ref text,
  add column if not exists apply_url text;

do $$ begin
  alter table public.opportunities
    add constraint opportunities_source_check
    check (source in ('shuru', 'remoteok', 'arbeitnow', 'lever', 'ashby', 'adzuna'));
exception when duplicate_object then null;
end $$;

-- ── structured content (read by the matching engine) ────────────
alter table public.opportunities
  add column if not exists description text,
  add column if not exists requirements text,
  add column if not exists skills_required text[] not null default '{}',
  add column if not exists work_mode text not null default 'onsite';

do $$ begin
  alter table public.opportunities
    add constraint opportunities_work_mode_check
    check (work_mode in ('onsite', 'remote', 'hybrid'));
exception when duplicate_object then null;
end $$;

-- ── compensation honesty ────────────────────────────────────────
-- is_paid alone cannot distinguish "unpaid" from "the source didn't say".
-- compensation_stated records whether the source made any claim at all.
alter table public.opportunities
  add column if not exists compensation_stated boolean not null default false,
  add column if not exists stipend_text text;

update public.opportunities
  set compensation_stated = true
  where compensation_stated = false and is_paid = true;

-- ── freshness / expiry ──────────────────────────────────────────
-- deadline_is_rolling marks sources that publish no real closing date; the
-- UI shows "Rolling" for these rather than inventing a hard deadline.
alter table public.opportunities
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_verified_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists deadline_is_rolling boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.opportunities
  set expires_at = (deadline + interval '1 day')
  where expires_at is null;

-- ── internship-only guarantee ───────────────────────────────────
alter table public.opportunities
  add column if not exists is_internship boolean not null default true;

do $$ begin
  alter table public.opportunities
    add constraint opportunities_internship_only check (is_internship);
exception when duplicate_object then null;
end $$;

-- ── indexes ─────────────────────────────────────────────────────
create index if not exists opportunities_status_idx
  on public.opportunities (status);
create index if not exists opportunities_source_idx
  on public.opportunities (source);
create index if not exists opportunities_company_idx
  on public.opportunities (company_id);
create index if not exists opportunities_expires_idx
  on public.opportunities (expires_at);
-- the discovery query: approved, unexpired, soonest deadline first
create index if not exists opportunities_discovery_idx
  on public.opportunities (status, expires_at, deadline);
-- one row per external listing; makes re-ingestion an upsert, not a duplicate
create unique index if not exists opportunities_source_ref_idx
  on public.opportunities (source, source_ref)
  where source_ref is not null;

-- ── keep updated_at honest ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists opportunities_touch_updated_at on public.opportunities;
create trigger opportunities_touch_updated_at
  before update on public.opportunities
  for each row execute function public.touch_updated_at();

drop trigger if exists companies_touch_updated_at on public.companies;
create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════
-- Row Level Security — replaces the blanket authenticated-read policy
-- ════════════════════════════════════════════════════════════════
drop policy if exists "opportunities_read" on public.opportunities;

-- Students see approved, unexpired listings. Employers additionally see
-- every listing belonging to a company they are a member of, in any state,
-- so they can work on drafts and read rejection feedback. Admins see all.
drop policy if exists "opportunities_select" on public.opportunities;
create policy "opportunities_select" on public.opportunities
  for select using (
    (status = 'approved' and (expires_at is null or expires_at > now()))
    or public.is_admin()
    or (company_id is not null and public.is_member_of_company(company_id))
    or posted_by = auth.uid()
  );

-- Employers post only under a company they belong to. The guard trigger
-- below forces the row to start as 'pending' regardless of what is sent.
drop policy if exists "opportunities_insert_employer" on public.opportunities;
create policy "opportunities_insert_employer" on public.opportunities
  for insert with check (
    public.is_admin()
    or (
      public.is_employer()
      and posted_by = auth.uid()
      and company_id is not null
      and public.is_member_of_company(company_id)
    )
  );

drop policy if exists "opportunities_update_owner" on public.opportunities;
create policy "opportunities_update_owner" on public.opportunities
  for update using (
    public.is_admin()
    or (company_id is not null and public.is_member_of_company(company_id))
  );

drop policy if exists "opportunities_delete_admin" on public.opportunities;
create policy "opportunities_delete_admin" on public.opportunities
  for delete using (
    public.is_admin()
    or (
      company_id is not null
      and public.is_member_of_company(company_id)
      and status = 'pending'
    )
  );

-- Moderation columns are admin-only, and an employer editing an approved
-- listing sends it back for review rather than silently changing what
-- students already saw.
create or replace function public.guard_opportunity_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_admin() or public.is_service_role() then
    return new;
  end if;

  new.status            := old.status;
  new.rejection_reason  := old.rejection_reason;
  new.requested_changes := old.requested_changes;
  new.reviewed_by       := old.reviewed_by;
  new.reviewed_at       := old.reviewed_at;
  new.source            := old.source;
  new.source_ref        := old.source_ref;
  new.is_verified       := old.is_verified;

  -- material edits to a live listing re-enter the review queue
  if old.status = 'approved' and (
       new.role is distinct from old.role
    or new.description is distinct from old.description
    or new.requirements is distinct from old.requirements
    or new.eligibility_rules is distinct from old.eligibility_rules
    or new.deadline is distinct from old.deadline
  ) then
    new.status := 'pending';
  end if;

  return new;
end;
$fn$;

drop trigger if exists opportunities_guard_moderation on public.opportunities;
create trigger opportunities_guard_moderation
  before update on public.opportunities
  for each row execute function public.guard_opportunity_moderation();

create or replace function public.guard_opportunity_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not (public.is_admin() or public.is_service_role()) then
    new.status := 'pending';
    new.source := 'shuru';
    new.is_verified := false;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists opportunities_guard_insert on public.opportunities;
create trigger opportunities_guard_insert
  before insert on public.opportunities
  for each row execute function public.guard_opportunity_insert();
