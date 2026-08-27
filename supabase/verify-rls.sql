-- ============================================================================
-- Database security verification
--
-- Ten invariants that must hold on any Shuru database. Every row this returns
-- with status 'FAIL' is a real finding; a clean run is ten 'PASS' rows.
--
-- Run it either way:
--   npm run verify:rls                 (needs SUPABASE_DB_URL in .env.local)
--   or paste into Supabase Dashboard -> SQL Editor
--
-- These are written as INVARIANTS, not as expected counts. Counts drift the
-- moment a table is added and then get "fixed" by editing the expectation,
-- which is how a security gate quietly stops being one. In particular
-- check 3 — "every privilege granted to `authenticated` has an RLS policy
-- that could use it" — replaces the hand-maintained grant tally that used to
-- live in docs/RUNBOOK.md.
--
-- Documented, deliberate exemptions are named inline. There is exactly one:
-- `schema_migrations` has RLS enabled with no policy, because only the
-- migration runner (service_role, which bypasses RLS) may touch the ledger.
-- ============================================================================

with

-- 1. RLS is the authorization boundary. A table without it has none.
c1 as (
  select 'RLS enabled on every table' as check_name,
         count(*) as failures,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '-') as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- 2. RLS with no policy denies everything, which is safe but usually a
--    mistake — someone enabled it and forgot the policies.
c2 as (
  select 'RLS-enabled tables have at least one policy' as check_name,
         count(*) as failures,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '-') as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and c.relname <> 'schema_migrations'   -- documented exemption
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
),

-- 3. The coarse gate must match the fine one. A privilege granted with no
--    policy that could ever use it is a grant waiting to be paired with a
--    careless new policy.
c3 as (
  select 'every authenticated grant has a matching policy' as check_name,
         count(*) as failures,
         coalesce(string_agg(g.table_name || '.' || g.privilege_type, ', '), '-') as detail
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee = 'authenticated'
    and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = g.table_name
        and (p.cmd = g.privilege_type or p.cmd = 'ALL')
    )
),

-- 4. The publishable key is public by design. It must reach nothing.
c4 as (
  select 'anon has no table privileges' as check_name,
         count(*) as failures,
         coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '), '-') as detail
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
),

-- 5. TRUNCATE is NOT subject to RLS. Neither anon nor authenticated has any
--    reason to hold it, or REFERENCES/TRIGGER on tables they do not own.
c5 as (
  select 'no TRUNCATE / REFERENCES / TRIGGER for anon or authenticated' as check_name,
         count(*) as failures,
         coalesce(string_agg(grantee || ':' || table_name || ':' || privilege_type, ', '), '-') as detail
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon','authenticated')
    and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
),

-- 6. Postgres grants EXECUTE to PUBLIC by default and anon inherits through
--    it, so revoking from anon alone is not enough — see migration 0009.
c6 as (
  select 'anon can execute no functions' as check_name,
         count(*) as failures,
         coalesce(string_agg(p.proname, ', '), '-') as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
),

-- 7. A SECURITY DEFINER function runs as its owner. Only the RLS policy
--    helpers are meant to be callable by a signed-in user; a guard trigger
--    reachable over /rest/v1/rpc would be a hole.
c7 as (
  select 'only policy helpers are SECURITY DEFINER + authenticated-callable' as check_name,
         count(*) as failures,
         coalesce(string_agg(p.proname, ', '), '-') as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname not in (
      'is_admin', 'is_employer', 'is_member_of_company',
      'is_member_of_opportunity_company', 'current_user_role'
    )
),

-- 8. An unpinned search_path lets a caller shadow a referenced object and
--    have a SECURITY DEFINER function run their code as the owner.
c8 as (
  select 'every function pins search_path' as check_name,
         count(*) as failures,
         coalesce(string_agg(p.proname, ', '), '-') as detail
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
    )
),

-- 9. There must be no self-service path to a role. Every write policy on
--    user_roles is gated on is_admin(); that is what stops a student granting
--    themselves admin.
c9 as (
  select 'no self-write path to user_roles' as check_name,
         count(*) as failures,
         coalesce(string_agg(policyname, ', '), '-') as detail
  from pg_policies
  where schemaname = 'public' and tablename = 'user_roles' and cmd <> 'SELECT'
    and coalesce(with_check, qual, '') not like '%is_admin%'
),

-- 10. Performance, but it regresses silently: an unwrapped auth.uid() is
--     re-evaluated once per candidate row. See migration 0011.
c10 as (
  select 'policies hoist auth.*() into an InitPlan' as check_name,
         count(*) as failures,
         coalesce(string_agg(tablename || '.' || policyname, ', '), '-') as detail
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(?<!SELECT )auth\.(uid|role)\(\)'
)

select check_name, case when failures = 0 then 'PASS' else 'FAIL' end as status, failures, detail
from (
  select * from c1 union all select * from c2 union all select * from c3
  union all select * from c4 union all select * from c5 union all select * from c6
  union all select * from c7 union all select * from c8 union all select * from c9
  union all select * from c10
) all_checks
order by status desc, check_name;
