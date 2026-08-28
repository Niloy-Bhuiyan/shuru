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

  -- ══ 7. EMPLOYER ACCESS CANNOT BE SELF-GRANTED ═════════════════════════
  -- 0016 opened the only path by which anyone becomes an employer. The whole
  -- point is that a user may ASK and only an admin may GRANT, so the three
  -- ways a request could be turned into a role by its own author are checked
  -- here rather than trusted to the UI.

  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', stranger)::text, true);
  set local role authenticated;

  -- (a) The decision RPC must refuse a non-admin. It is SECURITY INVOKER
  --     precisely so the admin-only policies still bind whoever calls it; a
  --     DEFINER function here would BE the escalation.
  begin
    perform public.decide_employer_access(gen_random_uuid(), true, null);
    raise exception 'ESCALATION: a non-admin approved an employer request';
  exception
    when insufficient_privilege then null;  -- expected
    when others then
      -- Any other error means the call died before reaching the check, so
      -- this test proved nothing. Fail loudly rather than count it as a pass:
      -- an earlier version of this file passed on 42703 (undefined_column).
      raise exception
        'EMPLOYER ACCESS CHECK INVALID: expected 42501, got % (%)',
        sqlstate, sqlerrm;
  end;

  -- (b) A non-admin must not be able to decide a request by plain UPDATE.
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename = 'employer_access_requests'
     and cmd = 'UPDATE'
     and qual not ilike '%is_admin%';
  if n <> 0 then
    raise exception
      'employer_access_requests has % non-admin UPDATE policies', n;
  end if;

  -- (c) The INSERT policy must pin both the owner and the pending state, so
  --     a crafted insert cannot arrive pre-approved.
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename = 'employer_access_requests'
     and cmd = 'INSERT'
     and with_check ilike '%pending%'
     and with_check ilike '%uid()%';
  if n <> 1 then
    raise exception
      'employer_access_requests INSERT policy does not pin owner + pending state (matched %)', n;
  end if;

  -- (d) The guard trigger must not be callable as an RPC. It is SECURITY
  --     DEFINER, so an EXECUTE grant to `authenticated` would hand out
  --     admin-context execution.
  if has_function_privilege('authenticated',
       'public.guard_employer_access_request()', 'EXECUTE') then
    raise exception
      'guard_employer_access_request is executable by authenticated';
  end if;

  raise notice 'ALL RLS BEHAVIOUR TESTS PASSED';
end $$;

select 'ALL PASSED' as result,
       'stranger isolation, public visibility, own-row read, no self-promotion, no cross-user write, payments not self-service, employer access not self-granted' as covered;
