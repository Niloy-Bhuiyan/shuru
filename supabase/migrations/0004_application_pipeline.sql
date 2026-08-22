-- ════════════════════════════════════════════════════════════════
-- 0004 — Application pipeline + append-only history
--
-- Student-visible pipeline:
--   Applied → Viewed → Shortlisted → Interview → Accepted / Rejected
-- ('saved' remains the bookmark state, which precedes the pipeline.)
--
-- Every status change writes an application_events row from a trigger, so
-- an employer action updates the student's history automatically and the
-- timeline can never be silently rewritten.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── widen the status vocabulary ─────────────────────────────────
alter table public.applications
  drop constraint if exists applications_status_check;

-- 'offer' was the old terminal success state
update public.applications set status = 'accepted' where status = 'offer';

do $$ begin
  alter table public.applications
    add constraint applications_status_check
    check (status in (
      'saved', 'applied', 'viewed', 'shortlisted',
      'interview', 'accepted', 'rejected'
    ));
exception when duplicate_object then null;
end $$;

alter table public.applications
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists applied_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists cover_note text,
  add column if not exists resume_id uuid
    references public.resumes (id) on delete set null,
  -- match score snapshotted at submission, so later profile edits do not
  -- retroactively change what the employer was shown
  add column if not exists match_score int,
  add column if not exists match_snapshot jsonb;

update public.applications
  set applied_at = updated_at
  where applied_at is null and status <> 'saved';

create index if not exists applications_opportunity_idx
  on public.applications (opportunity_id);
create index if not exists applications_status_idx
  on public.applications (status);

-- ── history ─────────────────────────────────────────────────────
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role public.user_role,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists application_events_app_idx
  on public.application_events (application_id, created_at);

-- ── company membership via a listing ────────────────────────────
create or replace function public.is_member_of_opportunity_company(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.opportunities o
    join public.employer_members m on m.company_id = o.company_id
    where o.id = target and m.user_id = auth.uid()
  );
$fn$;

-- ── history is written by the database, not the caller ──────────
create or replace function public.record_application_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events
      (application_id, from_status, to_status, actor_id, actor_role)
    values (new.id, null, new.status, auth.uid(), public.current_user_role());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.application_events
      (application_id, from_status, to_status, actor_id, actor_role)
    values (new.id, old.status, new.status, auth.uid(), public.current_user_role());
  end if;
  return new;
end;
$fn$;

drop trigger if exists applications_record_event on public.applications;
create trigger applications_record_event
  after insert or update on public.applications
  for each row execute function public.record_application_event();

-- ── who may move an application to which state ──────────────────
-- Students own the entry into the pipeline (saved → applied) and may
-- withdraw back to 'saved'. Everything downstream is the employer's
-- decision, so a student cannot shortlist or accept themselves.
create or replace function public.guard_application_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  employer_states constant text[] :=
    array['viewed', 'shortlisted', 'interview', 'accepted', 'rejected'];
begin
  if public.is_admin() or public.is_service_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = any (employer_states)
       and exists (
         select 1 from public.opportunities o
         where o.id = new.opportunity_id and o.company_id is not null
       ) then
      raise exception 'applications to a managed listing must start as saved or applied';
    end if;
    if new.status = 'applied' and new.applied_at is null then
      new.applied_at := now();
    end if;
    return new;
  end if;

  -- The applicant. Self-reporting the later stages stays legitimate for
  -- listings no employer manages here (curated and ingested rows have no
  -- company_id) — that is the personal tracker. Where a real employer owns
  -- the listing, only they may move the pipeline.
  if new.user_id = auth.uid() then
    if new.status is distinct from old.status
       and new.status = any (employer_states)
       and exists (
         select 1 from public.opportunities o
         where o.id = new.opportunity_id and o.company_id is not null
       ) then
      raise exception 'only the employer can set % on a managed listing', new.status;
    end if;
    if new.status = 'applied' and old.status <> 'applied'
       and new.applied_at is null then
      new.applied_at := now();
    end if;
    return new;
  end if;

  -- the employer that owns the listing
  if public.is_member_of_opportunity_company(new.opportunity_id) then
    if new.status is distinct from old.status
       and not (new.status = any (employer_states)) then
      raise exception 'employers cannot set %', new.status;
    end if;
    if new.status = 'viewed' and new.viewed_at is null then
      new.viewed_at := now();
    end if;
    -- an employer may only move the pipeline; the submission is immutable
    new.user_id        := old.user_id;
    new.opportunity_id := old.opportunity_id;
    new.cover_note     := old.cover_note;
    new.resume_id      := old.resume_id;
    new.match_score    := old.match_score;
    new.match_snapshot := old.match_snapshot;
    return new;
  end if;

  raise exception 'not authorized to modify this application';
end;
$fn$;

drop trigger if exists applications_guard_transition on public.applications;
create trigger applications_guard_transition
  before insert or update on public.applications
  for each row execute function public.guard_application_transition();

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table public.application_events enable row level security;

-- applications: the existing owner-only policies stay; employers gain read
-- and update on applications to their own listings.
drop policy if exists "applications_select_employer" on public.applications;
create policy "applications_select_employer" on public.applications
  for select using (
    public.is_admin()
    or public.is_member_of_opportunity_company(opportunity_id)
  );

drop policy if exists "applications_update_employer" on public.applications;
create policy "applications_update_employer" on public.applications
  for update using (
    public.is_admin()
    or public.is_member_of_opportunity_company(opportunity_id)
  );

-- events: readable by the applicant, the owning employer, and admins.
-- No insert/update/delete policy exists, so the trigger is the only writer.
drop policy if exists "application_events_select" on public.application_events;
create policy "application_events_select" on public.application_events
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.applications a
      where a.id = application_events.application_id
        and (
          a.user_id = auth.uid()
          or public.is_member_of_opportunity_company(a.opportunity_id)
        )
    )
  );
