-- ════════════════════════════════════════════════════════════════
-- 0008 — Tighten function and ledger exposure
--
-- Follow-up to 0007, which was correct about tables but too broad about
-- functions. Three findings from the Supabase database linter:
--
--   1. public.schema_migrations had RLS disabled AND, via 0007's default
--      privileges, inherited DML for `authenticated` — a signed-in user
--      could rewrite the migration ledger.
--   2. `grant execute on all functions` handed anon and authenticated an
--      RPC endpoint for every trigger function (/rest/v1/rpc/handle_new_user
--      and friends). Trigger functions are never invoked that way in normal
--      operation, so the exposure buys nothing.
--   3. touch_updated_at and is_service_role had a mutable search_path.
--
-- 0007 is left exactly as applied; corrections belong in a new migration,
-- not in a rewrite of one that already ran.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── 1. the migration ledger is infrastructure, not app data ─────
-- RLS on with no policy at all: service_role bypasses RLS and keeps full
-- access (that is the only thing that writes it — scripts/migrate.mjs
-- connects directly), while every API role is denied.
alter table public.schema_migrations enable row level security;
revoke all privileges on public.schema_migrations from anon, authenticated;

-- ── 2. pin search_path on the two functions that lacked it ──────
-- Without this a caller can prepend a schema and shadow the objects these
-- functions reference. The rest of the functions already set it.
alter function public.touch_updated_at() set search_path = public;
alter function public.is_service_role() set search_path = public;

-- ── 3. anon needs no function access whatsoever ─────────────────
-- Shuru requires sign-in for every data surface and 0007 left anon with no
-- table privileges, so no RLS policy is ever evaluated for anon and no
-- helper needs to be callable by it.
revoke execute on all functions in schema public from anon;

-- ── 4. trigger functions are not RPCs ───────────────────────────
-- PostgreSQL does not check EXECUTE when a trigger fires, so revoking it
-- here removes the REST endpoint without affecting any trigger.
-- The policy helpers (is_admin, is_employer, current_user_role,
-- is_member_of_company, is_member_of_opportunity_company, is_service_role)
-- are deliberately NOT revoked: RLS policy expressions are evaluated as the
-- calling role, which therefore does need EXECUTE on them.
revoke execute on function public.touch_updated_at() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.guard_company_verification() from authenticated;
revoke execute on function public.guard_opportunity_moderation() from authenticated;
revoke execute on function public.guard_opportunity_insert() from authenticated;
revoke execute on function public.record_application_event() from authenticated;
revoke execute on function public.guard_application_transition() from authenticated;
revoke execute on function public.guard_notification_update() from authenticated;
revoke execute on function public.notify_application_status() from authenticated;

-- ── 5. future functions do not inherit execute ──────────────────
-- 0007 set default privileges for tables and sequences but not functions;
-- Postgres grants EXECUTE to PUBLIC by default, so pin it shut explicitly.
alter default privileges in schema public
  revoke execute on functions from public;
