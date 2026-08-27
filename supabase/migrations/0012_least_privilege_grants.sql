-- ============================================================================
-- 0012 — least-privilege table grants
--
-- Found by scripts/verify-rls.mjs, which this migration exists to make pass.
--
-- WHAT WAS WRONG
--
-- Supabase ships default privileges that grant ALL on new public tables to
-- `anon` and `authenticated`. Migration 0007 corrected this for the tables
-- that existed at the time, but did so asymmetrically:
--
--   * for `anon` it ran `revoke all privileges on all tables ... from anon`,
--     which was correct — but only for tables existing in 0007. Table
--     `push_subscriptions` was created later, by 0010, and inherited the
--     defaults again. It ended up with REFERENCES, TRIGGER and TRUNCATE
--     granted to `anon`.
--
--   * for `authenticated` it ran `grant select, insert, update, delete`,
--     which is additive. It never revoked the ALL that was already there, so
--     `authenticated` still held REFERENCES, TRIGGER and TRUNCATE on all 17
--     tables.
--
-- WHY IT MATTERS
--
-- TRUNCATE is the one that counts: **TRUNCATE is not subject to Row Level
-- Security**. A policy that carefully restricts `delete` to your own rows does
-- nothing against `truncate public.applications`.
--
-- Honest scope: this was not reachable through the public HTTP API today.
-- PostgREST maps HTTP DELETE to SQL DELETE and exposes no TRUNCATE verb, so
-- there is no known request that exploited it. It is a latent least-privilege
-- violation — the kind that becomes a live one the moment someone adds a
-- SECURITY INVOKER function, a direct Postgres connection using a user JWT, or
-- a new RPC. REFERENCES and TRIGGER are lesser but equally unnecessary: they
-- let a grantee attach a foreign key or a trigger to a table they do not own.
--
-- WHAT THIS CHANGES FOR THE APPLICATION
--
-- Nothing. Every DML privilege revoked below is one that RLS already refused —
-- the table has no policy for that command, so the grant could never have
-- produced a successful statement. Grants are the coarse gate and policies the
-- fine one; this aligns the coarse gate with the fine one instead of leaving
-- it wide and trusting the policies alone.
-- ============================================================================

-- ── revoke the three privileges nothing needs, everywhere ───────────────────
revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- ── push_subscriptions: the table 0007 could not have covered ──────────────
-- 0010 created it after 0007 ran, so re-apply 0007's rule explicitly rather
-- than relying on the blanket revoke above having caught it.
revoke all privileges on public.push_subscriptions from anon;

-- ── stop the next table from repeating this ────────────────────────────────
-- `alter default privileges` applies to objects created FROM NOW ON by the
-- role running it. Without this, a future migration creating a table would
-- hand `anon` the same three privileges again, and the only thing standing
-- between that and production would be someone remembering.
alter default privileges in schema public
  revoke all on tables from anon;

alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;


-- ── align DML grants with the policies that actually exist ─────────────────
--
-- Baseline, then subtract. Each revoke below names a (table, command) pair
-- that has NO RLS policy permitting it, so the privilege was unusable.
grant select, insert, update, delete
  on all tables in schema public to authenticated;

-- Read-only reference data: anonymised cohort outcomes, interview reports and
-- opted-in mentors. Written by seed/service role only.
revoke insert, update, delete on public.outcomes from authenticated;
revoke insert, update, delete on public.interview_reports from authenticated;
revoke insert, update, delete on public.mentors from authenticated;

-- Append-only audit trails: rows come from triggers and the service role.
revoke insert, update, delete on public.application_events from authenticated;
revoke insert, update, delete on public.admin_audit_log from authenticated;

-- Operator-only ingestion ledger: admins read it through RLS; the service role
-- writes it during a run.
revoke insert, update, delete on public.ingestion_runs from authenticated;

-- Notifications are written by trigger or service role, never by the recipient.
revoke insert on public.notifications from authenticated;

-- A profile is created and edited, never deleted through the API. Account
-- deletion is an auth-level operation that cascades.
revoke delete on public.profiles from authenticated;

-- Membership is granted and revoked (insert/delete), never edited in place;
-- there is no employer_members UPDATE policy.
revoke update on public.employer_members from authenticated;

-- A report can be filed and resolved by an admin, but never withdrawn — the
-- moderation trail must not be erasable by the reporter.
revoke delete on public.listing_reports from authenticated;

-- The migration ledger belongs to the migration runner alone. It has RLS on
-- with no policy by design, so `authenticated` could never read it — but the
-- grant implied otherwise to anyone auditing privileges.
revoke all privileges on public.schema_migrations from authenticated;

-- service_role bypasses RLS and runs ingestion, dispatch and admin operations.
grant all privileges on all tables in schema public to service_role;
