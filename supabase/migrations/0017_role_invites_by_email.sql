-- 0017 — role invites, keyed to an email address
--
-- 0016 gave employers a way in: ask, and an admin grants. It does not answer
-- how a SECOND admin is made, and it is heavy for the case where an admin
-- already knows exactly who they are adding.
--
-- ── WHY THIS IS NOT A SHAREABLE CODE ───────────────────────────────────────
--
-- The obvious design is a single-use code an admin hands out, redeemed by an
-- RPC. That RPC cannot be SECURITY INVOKER: the whole point is that someone
-- unprivileged ends up privileged, and user_roles is admin-only for writes.
-- It would therefore be a SECURITY DEFINER function, callable by any signed-in
-- user, that grants a role in response to an attacker-controllable string.
-- That is a privilege-escalation primitive no matter how carefully it is
-- written, and this schema has spent five migrations not having one.
--
-- Keying the invite to an EMAIL removes the need entirely, by splitting the
-- two cases:
--
--   NEW user  — handle_new_user already runs on auth.users insert, already
--               SECURITY DEFINER, and already decides the starting role. It
--               now consults this table first. No new callable surface: a
--               trigger is not reachable over /rest/v1/rpc, and the address
--               it matches is the one Supabase Auth just verified, not one
--               the user handed us at call time.
--
--   EXISTING user — needs nothing new at all. An admin already holds
--               INSERT/UPDATE on user_roles under 0011's policies, so the
--               dashboard simply writes the role. The permission that would
--               have been escalated is one the actor already has.
--
-- The cost is that an invite is not forwardable. That is also the security
-- property: a leaked invite is useless to anyone but the named address.

create table if not exists public.role_invites (
  id uuid primary key default gen_random_uuid(),
  -- Stored lowercased; matching is case-insensitive because an address is.
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role public.user_role not null check (role in ('employer', 'admin')),
  note text,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

-- One live invite per address. Spent and revoked ones stay as history.
create unique index if not exists role_invites_one_open
  on public.role_invites (email)
  where accepted_by is null and revoked_at is null;

create index if not exists role_invites_open_idx
  on public.role_invites (created_at desc)
  where accepted_by is null and revoked_at is null;

alter table public.role_invites enable row level security;

-- ── policies: admins only, for everything ───────────────────────────────────
--
-- An invitee never reads this table. They do not need to: the trigger below
-- runs as owner and does the lookup. A readable invite table would let any
-- signed-in user enumerate who is about to become an admin.

drop policy if exists role_invites_select_admin on public.role_invites;
create policy role_invites_select_admin on public.role_invites
  for select using ((select public.is_admin()));

drop policy if exists role_invites_insert_admin on public.role_invites;
create policy role_invites_insert_admin on public.role_invites
  for insert with check (
    (select public.is_admin()) and invited_by = (select auth.uid())
  );

drop policy if exists role_invites_update_admin on public.role_invites;
create policy role_invites_update_admin on public.role_invites
  for update using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists role_invites_delete_admin on public.role_invites;
create policy role_invites_delete_admin on public.role_invites
  for delete using ((select public.is_admin()));

-- ── the grant, inside the existing signup trigger ───────────────────────────
--
-- Replaces the 0002 version. That one always inserted 'student'; this one
-- checks for a live invite on the address Supabase Auth just confirmed, and
-- marks the invite spent in the same transaction as the role it granted, so
-- the two can never disagree.
--
-- Still SECURITY DEFINER and still a trigger on auth.users — the privilege
-- level is unchanged from what 0002 already had. What is new is that the role
-- it writes can be something an admin chose earlier.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_invite public.role_invites;
  v_role   public.user_role := 'student';
begin
  if new.email is not null then
    -- Claim atomically. A read-then-write would let two signups on the same
    -- address both see the invite as open.
    update public.role_invites
       set accepted_by = new.id,
           accepted_at = now()
     where email = lower(new.email)
       and accepted_by is null
       and revoked_at is null
       and expires_at > now()
    returning * into v_invite;

    if v_invite.id is not null then
      v_role := v_invite.role;
    end if;
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, v_role)
  on conflict (user_id) do nothing;

  if v_invite.id is not null then
    insert into public.admin_audit_log
      (actor_id, action, entity_type, entity_id, after_state, note)
    values (v_invite.invited_by, 'role_invite.accepted', 'role_invite', v_invite.id,
            jsonb_build_object('role', v_role, 'accepted_by', new.id), v_invite.note);
  end if;

  return new;
end;
$fn$;

-- ── grants ──────────────────────────────────────────────────────────────────
-- 0012's rule: name the (table, command) pairs rather than trust Supabase's
-- default privileges. Every policy above is admin-gated, so `authenticated`
-- holding the verbs grants nothing to a non-admin.

revoke all privileges on public.role_invites from anon;
grant select, insert, update, delete on public.role_invites to authenticated;
revoke truncate, references, trigger on public.role_invites from authenticated;
