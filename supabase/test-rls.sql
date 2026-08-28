-- ============================================================================
-- RLS BEHAVIOUR TESTS
--
-- `verify-rls.sql` checks the SHAPE of the security config — that policies
-- exist, that grants match them, that nothing is over-privileged. This file
-- checks what those policies actually DO, by becoming each role and looking.
--
-- Both are needed. A table can have a policy for every command, pass every
-- structural invariant, and still return another student's applications
-- because the policy's WHERE clause is wrong.
--
--   npm run test:rls
--   or paste into Supabase Dashboard -> SQL Editor
--
-- NON-DESTRUCTIVE. It creates nothing and deletes nothing. It works by
-- switching to `authenticated` with a synthetic JWT `sub` and counting what
-- becomes visible, which is exactly what PostgREST does per request. Every
-- assertion raises on failure, so a clean run ends with one 'ALL PASSED' row.
--
-- The synthetic uuid is fixed and belongs to nobody. If a real user is ever
-- created with it, these tests start failing loudly rather than silently
-- passing — which is the correct direction to fail in.
-- ============================================================================

do $$
declare
  stranger  constant uuid := '00000000-0000-4000-8000-0000000000ff';
  real_user uuid;
  n             int;
  expected      int;
  sqlstate_seen text;
begin
  select user_id into real_user from public.profiles limit 1;

  -- ══ 1. A STRANGER SEES NOTHING THEY DO NOT OWN ════════════════════════
  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', stranger)::text, true);
  set local role authenticated;

  -- Owner-scoped tables. Every one of these leaking is a privacy incident.
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'LEAK profiles: stranger sees %', n; end if;

  select count(*) into n from public.applications;
  if n <> 0 then raise exception 'LEAK applications: stranger sees %', n; end if;

  select count(*) into n from public.resumes;
  if n <> 0 then raise exception 'LEAK resumes: stranger sees %', n; end if;

  select count(*) into n from public.notifications;
  if n <> 0 then raise exception 'LEAK notifications: stranger sees %', n; end if;

  select count(*) into n from public.notification_preferences;
  if n <> 0 then raise exception 'LEAK notification_preferences: stranger sees %', n; end if;

  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'LEAK push_subscriptions: stranger sees %', n; end if;

  select count(*) into n from public.user_roles;
  if n <> 0 then raise exception 'LEAK user_roles: stranger sees %', n; end if;

  select count(*) into n from public.application_events;
  if n <> 0 then raise exception 'LEAK application_events: stranger sees %', n; end if;

  -- Operator-only tables. A student reading these learns how the service runs.
  select count(*) into n from public.admin_audit_log;
  if n <> 0 then raise exception 'LEAK admin_audit_log: non-admin sees %', n; end if;

  select count(*) into n from public.ingestion_runs;
  if n <> 0 then raise exception 'LEAK ingestion_runs: non-admin sees %', n; end if;

  select count(*) into n from public.payments;
  if n <> 0 then raise exception 'LEAK payments: non-member sees %', n; end if;

  reset role;

  -- ══ 2. PUBLIC DATA IS VISIBLE, BUT ONLY THE PUBLIC PART ═══════════════
  select count(*) into expected from public.opportunities
   where status = 'approved' and (expires_at is null or expires_at > now());

  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', stranger)::text, true);
  set local role authenticated;
  select count(*) into n from public.opportunities;
  reset role;

  if n <> expected then
    raise exception
      'opportunities visibility wrong: stranger sees %, expected % (approved + unexpired)',
      n, expected;
  end if;

  -- The retrieval corpus must not out-reach the listings it came from, or a
  -- cited answer could quote a listing the student cannot open.
  select count(*) into expected from public.rag_chunks c
    join public.opportunities o on o.id = c.opportunity_id
   where o.status = 'approved' and (o.expires_at is null or o.expires_at > now());

  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', stranger)::text, true);
  set local role authenticated;
  select count(*) into n from public.rag_chunks;
  reset role;

  if n <> expected then
    raise exception 'rag_chunks visibility wrong: sees %, expected %', n, expected;
  end if;

  -- ══ 3. A USER DOES SEE THEIR OWN ROW ══════════════════════════════════
  -- Without this the suite would pass on a database that denied everything.
  if real_user is not null then
    perform set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', real_user)::text, true);
    set local role authenticated;
    select count(*) into n from public.profiles;
    reset role;

    if n <> 1 then
      raise exception 'own-row read broken: owner sees % of their own profile', n;
    end if;
  end if;

  -- ══ 4. NO SELF-PROMOTION ══════════════════════════════════════════════
  -- The single most valuable negative test here. If this ever passes, any
  -- student can make themselves an admin.
  --
  -- NOTE THE ASSERTION: it demands SQLSTATE **42501** (insufficient_privilege),
  -- not merely "an error happened". An earlier draft of this file caught
  -- `others` and passed for the wrong reason entirely — the INSERT named a
  -- column that does not exist, so it failed with 42703 and the test called
  -- that a successful block. A negative test that accepts any failure will
  -- eventually accept the wrong one.
  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', stranger)::text, true);
  set local role authenticated;

  sqlstate_seen := 'NONE';
  begin
    insert into public.user_roles (user_id, role) values (stranger, 'admin');
    -- Reached only if the insert was ALLOWED.
  exception when others then
    get stacked diagnostics sqlstate_seen = RETURNED_SQLSTATE;
  end;
  reset role;

  if sqlstate_seen <> '42501' then
    raise exception
      'PRIVILEGE ESCALATION CHECK INVALID: expected 42501 (RLS denial), got %',
      sqlstate_seen;
  end if;

  -- ══ 5. NO WRITING ANOTHER USER'S ROW ══════════════════════════════════
  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', stranger)::text, true);
  set local role authenticated;

  sqlstate_seen := 'NONE';
  begin
    -- `real_user` is somebody else from the stranger's point of view.
    insert into public.profiles (user_id, name, university, department, year, cgpa)
    values (real_user, 'probe', 'probe', 'CSE', 1, 3.0);
  exception when others then
    get stacked diagnostics sqlstate_seen = RETURNED_SQLSTATE;
  end;
  reset role;

  if sqlstate_seen <> '42501' then
    raise exception
      'CROSS-USER WRITE CHECK INVALID: expected 42501 (RLS denial), got %',
      sqlstate_seen;
  end if;

  -- Why there is no "own-row insert succeeds" control here: the synthetic
  -- stranger has no `auth.users` row, so an own-row insert stops at the
  -- foreign key (23503) before it proves anything about RLS. That it reaches
  -- the FK at all is itself the signal — RLS let it through on ownership.
  -- Check 3 above is the positive control that matters: a real owner reads
  -- their own row.

  -- ══ 6. PAYMENTS ARE NOT SELF-SERVICE ══════════════════════════════════
  -- `payments` has no UPDATE policy at all, so a client cannot mark its own
  -- payment succeeded and collect the entitlement without paying.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'payments' and cmd = 'UPDATE';
  if n <> 0 then
    raise exception 'payments has % UPDATE policies; state must move only via the webhook', n;
  end if;

  raise notice 'ALL RLS BEHAVIOUR TESTS PASSED';
end $$;

select 'ALL PASSED' as result,
       'stranger isolation, public visibility, own-row read, no self-promotion, no cross-user write, payments not self-service' as covered;
