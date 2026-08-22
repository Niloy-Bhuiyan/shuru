-- ════════════════════════════════════════════════════════════════
-- 0007 — API role grants
--
-- Migrations 0001–0006 defined RLS policies but never granted table
-- privileges to the PostgREST roles, so every request failed with
-- 42501 "permission denied for table" before RLS was ever consulted.
--
-- Grants are the coarse gate (may this role touch the table at all);
-- RLS is the fine gate (which rows). Both are required.
--
-- Posture:
--   service_role  — full access; it is trusted server-side and bypasses RLS
--   authenticated — DML on the tables, with RLS deciding the rows
--   anon          — no table access at all. Shuru requires sign-in for every
--                   data surface, so the anonymous role never needs to read a
--                   table; leaving it ungranted means a leaked publishable
--                   key exposes nothing even if a policy is later loosened.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated, service_role;

-- ── service_role: trusted server-side worker ────────────────────
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ── authenticated: DML, constrained by RLS ──────────────────────
grant select, insert, update, delete
  on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ── anon: execute only, no table access ─────────────────────────
-- (auth.uid()-based policy helpers still need to be callable during the
--  brief window where a request is evaluated before a session is attached)
grant execute on all functions in schema public to anon;
revoke all privileges on all tables in schema public from anon;

-- ── append-only tables: defence in depth ────────────────────────
-- RLS already denies these writes (no insert/update/delete policy exists),
-- but removing the privilege means a future policy mistake cannot open them.
-- Both are written by SECURITY DEFINER triggers, which are unaffected.
revoke insert, update, delete on public.application_events from authenticated;
revoke insert, update, delete on public.admin_audit_log from authenticated;

-- notifications are created server-side or by trigger; a client may only
-- flip read state (guarded further by guard_notification_update)
revoke insert on public.notifications from authenticated;

-- ── future objects inherit the same posture ─────────────────────
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
