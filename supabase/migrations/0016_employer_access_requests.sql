-- 0016 — employer access requests
--
-- THE HOLE THIS CLOSES
--
-- `handle_new_user` gives every signup the `student` role, and 0011 left
-- user_roles with admin-only INSERT/UPDATE/DELETE and deliberately no
-- self-write path. That is correct — it is the reason a user cannot grant
-- themselves a role — but nothing was ever built on the other side of it.
-- There is no UI, no RPC and no request flow through which an admin can
-- grant `employer` to anyone.
--
-- The consequence is that the entire employer product — company setup,
-- listing posting, the applicant pipeline and the promoted-placement
-- payments that sit behind it — is unreachable in production. The only way
-- in is hand-written SQL.
--
-- This migration adds the missing path WITHOUT weakening the rule. A user
-- may ask; only an admin may grant; and the database, not the UI, is what
-- enforces the difference.

-- ── the request ─────────────────────────────────────────────────────────────

create table if not exists public.employer_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text not null,
  company_website text,
  contact_role text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

-- One OPEN request per user. Decided requests stay as history, so a user
-- who was rejected can ask again and an admin can see that they were.
create unique index if not exists employer_access_requests_one_open
  on public.employer_access_requests (user_id)
  where status = 'pending';

create index if not exists employer_access_requests_status_idx
  on public.employer_access_requests (status, created_at desc);

alter table public.employer_access_requests enable row level security;

-- ── policies ────────────────────────────────────────────────────────────────
--
-- Read your own, or everything as an admin. `is_admin()` is wrapped in a
-- scalar subquery so it hoists to an InitPlan rather than re-evaluating per
-- row, matching the convention 0011 established across every policy.

drop policy if exists employer_access_requests_select on public.employer_access_requests;
create policy employer_access_requests_select on public.employer_access_requests
  for select using (
    (select auth.uid()) = user_id or (select public.is_admin())
  );

-- A user may file a request FOR THEMSELVES and only in the `pending` state.
-- Pinning the status in the policy means a crafted insert cannot arrive
-- pre-approved; the trigger below pins it a second time for the paths that
-- do not go through this policy at all.
drop policy if exists employer_access_requests_insert_own on public.employer_access_requests;
create policy employer_access_requests_insert_own on public.employer_access_requests
  for insert with check (
    (select auth.uid()) = user_id and status = 'pending'
  );

-- Deciding a request is an admin act. There is no self-review path, exactly
-- as there is no self-promotion path on user_roles.
drop policy if exists employer_access_requests_update_admin on public.employer_access_requests;
create policy employer_access_requests_update_admin on public.employer_access_requests
  for update using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists employer_access_requests_delete_admin on public.employer_access_requests;
create policy employer_access_requests_delete_admin on public.employer_access_requests
  for delete using ((select public.is_admin()));

-- ── the guard ───────────────────────────────────────────────────────────────
--
-- Belt and braces for the review fields, in the same shape as
-- `guard_company_verification` in 0002. A policy governs whether a statement
-- runs; this governs what the row is allowed to contain afterwards, and it
-- covers paths where the policy is not consulted.

create or replace function public.guard_employer_access_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_admin() or public.is_service_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A request always begins undecided, whatever the caller supplied.
    new.status       := 'pending';
    new.reviewed_by  := null;
    new.reviewed_at  := null;
    new.review_notes := null;
    return new;
  end if;

  -- Non-admin UPDATE cannot touch the decision. Reachable only if the
  -- update policy above is ever loosened; it costs nothing to hold here.
  new.status       := old.status;
  new.reviewed_by  := old.reviewed_by;
  new.reviewed_at  := old.reviewed_at;
  new.review_notes := old.review_notes;
  new.user_id      := old.user_id;
  return new;
end;
$fn$;

drop trigger if exists employer_access_requests_guard on public.employer_access_requests;
create trigger employer_access_requests_guard
  before insert or update on public.employer_access_requests
  for each row execute function public.guard_employer_access_request();

-- ── the decision ────────────────────────────────────────────────────────────
--
-- Approving is two writes that must not come apart: mark the request decided,
-- and set the role. A client doing them as separate statements can leave a
-- user holding `employer` against a request that still reads `pending`, or
-- the reverse.
--
-- SECURITY INVOKER, deliberately, following `match_rag_chunks` in 0015. A
-- DEFINER function here would be a privilege-escalation primitive callable by
-- `authenticated` — precisely the thing this file exists to prevent. As an
-- INVOKER function the writes are still governed by the admin-only policies
-- on user_roles and on this table, so a non-admin calling it gets 42501 and
-- changes nothing. It buys atomicity, not permission.

create or replace function public.decide_employer_access(
  p_request_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns public.employer_access_requests
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_request public.employer_access_requests;
begin
  update public.employer_access_requests
     set status       = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by  = auth.uid(),
         reviewed_at  = now(),
         review_notes = p_notes
   where id = p_request_id
     and status = 'pending'
  returning * into v_request;

  -- No row means: not found, already decided, or RLS refused the update.
  -- Raising keeps a non-admin caller from reading silence as success.
  if v_request.id is null then
    raise exception 'request not found, already decided, or not permitted'
      using errcode = '42501';
  end if;

  if p_approve then
    -- Never downgrade an admin who happens to have filed a request.
    insert into public.user_roles (user_id, role)
    values (v_request.user_id, 'employer')
    on conflict (user_id) do update
      set role = 'employer'
      where public.user_roles.role = 'student';
  end if;

  insert into public.admin_audit_log
    (actor_id, action, entity_type, entity_id, after_state, note)
  values (
    auth.uid(),
    case when p_approve then 'employer_access.approve' else 'employer_access.reject' end,
    'employer_access_request',
    v_request.id,
    to_jsonb(v_request),
    p_notes
  );

  return v_request;
end;
$fn$;

-- ── grants ──────────────────────────────────────────────────────────────────
--
-- 0012's rule: name the (table, command) pairs explicitly rather than trust
-- Supabase's default privileges, which re-grant ALL on every newly created
-- table. DELETE is granted because an admin policy exists for it; there is no
-- authenticated path that can use it without being an admin.

revoke all privileges on public.employer_access_requests from anon;
grant select, insert, update, delete
  on public.employer_access_requests to authenticated;
revoke truncate, references, trigger
  on public.employer_access_requests from authenticated;

revoke all on function public.decide_employer_access(uuid, boolean, text) from public;
revoke all on function public.decide_employer_access(uuid, boolean, text) from anon;
grant execute on function public.decide_employer_access(uuid, boolean, text) to authenticated;

revoke all on function public.guard_employer_access_request() from public;
revoke all on function public.guard_employer_access_request() from anon;
revoke all on function public.guard_employer_access_request() from authenticated;
