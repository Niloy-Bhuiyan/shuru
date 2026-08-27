-- ============================================================================
-- 0011 — RLS evaluation cost, duplicate policies, and foreign-key indexes
--
-- Remediates every actionable finding from Supabase's performance advisor.
-- This migration is deliberately BEHAVIOUR-PRESERVING: it changes how the
-- planner evaluates the policies, not who can see or write which row. If you
-- are reviewing it, the test to apply is "does any subject gain or lose
-- access?" — the answer must be no everywhere.
--
-- Three classes of change:
--
--  1. `auth.uid()` / `auth.role()` / `is_admin()` / `is_employer()` are wrapped
--     in a scalar subquery — `(select auth.uid())`. Unwrapped, Postgres treats
--     them as volatile per-row calls and re-evaluates them for every candidate
--     row; wrapped, they become an InitPlan evaluated once per statement. Same
--     value, same result, one call instead of N.
--
--     `is_member_of_company(company_id)` and
--     `is_member_of_opportunity_company(opportunity_id)` are deliberately NOT
--     wrapped: they take a column, so they are genuinely row-dependent and a
--     subquery cannot hoist them.
--
--  2. Duplicate permissive policies are merged. Two permissive policies for the
--     same role and command are OR-ed by Postgres, but both are evaluated for
--     every row. One policy with an OR-ed expression is identical in meaning
--     and half the work.
--
--  3. Indexes on the ten foreign keys that had none. Postgres does not index
--     the referencing side of a FK automatically, which makes both joins and
--     the referential-integrity check on parent delete/update a sequential
--     scan.
--
-- Written with `drop policy if exists` so it is safe to re-run.
-- ============================================================================


-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = user_id);


-- ── applications ────────────────────────────────────────────────────────────
-- SELECT and UPDATE each had two permissive policies (own + employer). Merged
-- into one policy per command; the OR is what Postgres was computing anyway.
--
-- The employer branch reaches the row through the opportunity's company, and
-- an admin sees everything. Note the guard trigger `guard_application_transition`
-- still governs WHICH status changes are legal — this policy only decides who
-- may attempt one.
drop policy if exists applications_select_own on public.applications;
drop policy if exists applications_select_employer on public.applications;
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select using (
    (select auth.uid()) = user_id
    or (select is_admin())
    or is_member_of_opportunity_company(opportunity_id)
  );

drop policy if exists applications_insert_own on public.applications;
create policy applications_insert_own on public.applications
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists applications_update_own on public.applications;
drop policy if exists applications_update_employer on public.applications;
drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications
  for update using (
    (select auth.uid()) = user_id
    or (select is_admin())
    or is_member_of_opportunity_company(opportunity_id)
  );

drop policy if exists applications_delete_own on public.applications;
create policy applications_delete_own on public.applications
  for delete using ((select auth.uid()) = user_id);


-- ── outcomes / interview_reports / mentors ──────────────────────────────────
-- Anonymised aggregate data, readable by any signed-in user. `outcomes` has no
-- user_id column and its profile_snapshot carries only cohort attributes
-- (cgpa, dept, year, project flags) — see ISSUES.md for why row-level access
-- here is not a PII exposure.
drop policy if exists outcomes_read on public.outcomes;
create policy outcomes_read on public.outcomes
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists interview_reports_read on public.interview_reports;
create policy interview_reports_read on public.interview_reports
  for select using ((select auth.role()) = 'authenticated');

drop policy if exists mentors_read on public.mentors;
create policy mentors_read on public.mentors
  for select using ((select auth.role()) = 'authenticated' and opt_in = true);


-- ── resumes ─────────────────────────────────────────────────────────────────
drop policy if exists resumes_select_own on public.resumes;
create policy resumes_select_own on public.resumes
  for select using ((select auth.uid()) = user_id);

drop policy if exists resumes_insert_own on public.resumes;
create policy resumes_insert_own on public.resumes
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists resumes_update_own on public.resumes;
create policy resumes_update_own on public.resumes
  for update using ((select auth.uid()) = user_id);

drop policy if exists resumes_delete_own on public.resumes;
create policy resumes_delete_own on public.resumes
  for delete using ((select auth.uid()) = user_id);


-- ── user_roles ──────────────────────────────────────────────────────────────
-- `user_roles_admin_write` was FOR ALL, so it also produced a second permissive
-- SELECT policy alongside `user_roles_select_own`. Split into the three write
-- commands it was actually there for; SELECT is left to the own-row policy,
-- which already grants admins the same visibility via `or is_admin()`.
--
-- There is still deliberately NO self-write path to this table: that is the
-- entire reason a user cannot grant themselves a role.
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select using (
    (select auth.uid()) = user_id or (select is_admin())
  );

drop policy if exists user_roles_admin_write on public.user_roles;
drop policy if exists user_roles_insert_admin on public.user_roles;
drop policy if exists user_roles_update_admin on public.user_roles;
drop policy if exists user_roles_delete_admin on public.user_roles;

create policy user_roles_insert_admin on public.user_roles
  for insert with check ((select is_admin()));

create policy user_roles_update_admin on public.user_roles
  for update using ((select is_admin())) with check ((select is_admin()));

create policy user_roles_delete_admin on public.user_roles
  for delete using ((select is_admin()));


-- ── companies ───────────────────────────────────────────────────────────────
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (
    verification_status = 'approved'
    or (select is_admin())
    or is_member_of_company(id)
  );

drop policy if exists companies_insert_employer on public.companies;
create policy companies_insert_employer on public.companies
  for insert with check (
    (select is_employer()) and created_by = (select auth.uid())
  );

drop policy if exists companies_update_member on public.companies;
create policy companies_update_member on public.companies
  for update using (is_member_of_company(id) or (select is_admin()));

drop policy if exists companies_delete_admin on public.companies;
create policy companies_delete_admin on public.companies
  for delete using ((select is_admin()));


-- ── employer_members ────────────────────────────────────────────────────────
drop policy if exists employer_members_select on public.employer_members;
create policy employer_members_select on public.employer_members
  for select using (
    user_id = (select auth.uid())
    or is_member_of_company(company_id)
    or (select is_admin())
  );

drop policy if exists employer_members_insert on public.employer_members;
create policy employer_members_insert on public.employer_members
  for insert with check (
    (select is_admin())
    or (
      (select is_employer())
      and (
        user_id = (select auth.uid())
        or exists (
          select 1 from public.employer_members m
          where m.company_id = employer_members.company_id
            and m.user_id = (select auth.uid())
            and m.is_owner
        )
      )
    )
  );

drop policy if exists employer_members_delete on public.employer_members;
create policy employer_members_delete on public.employer_members
  for delete using (
    (select is_admin())
    or exists (
      select 1 from public.employer_members m
      where m.company_id = employer_members.company_id
        and m.user_id = (select auth.uid())
        and m.is_owner
    )
  );


-- ── opportunities ───────────────────────────────────────────────────────────
drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities
  for select using (
    (status = 'approved' and (expires_at is null or expires_at > now()))
    or (select is_admin())
    or (company_id is not null and is_member_of_company(company_id))
    or posted_by = (select auth.uid())
  );

drop policy if exists opportunities_insert_employer on public.opportunities;
create policy opportunities_insert_employer on public.opportunities
  for insert with check (
    (select is_admin())
    or (
      (select is_employer())
      and posted_by = (select auth.uid())
      and company_id is not null
      and is_member_of_company(company_id)
    )
  );

drop policy if exists opportunities_update_owner on public.opportunities;
create policy opportunities_update_owner on public.opportunities
  for update using (
    (select is_admin())
    or (company_id is not null and is_member_of_company(company_id))
  );

drop policy if exists opportunities_delete_admin on public.opportunities;
create policy opportunities_delete_admin on public.opportunities
  for delete using (
    (select is_admin())
    or (
      company_id is not null
      and is_member_of_company(company_id)
      and status = 'pending'
    )
  );


-- ── application_events (append-only audit trail) ────────────────────────────
drop policy if exists application_events_select on public.application_events;
create policy application_events_select on public.application_events
  for select using (
    (select is_admin())
    or exists (
      select 1 from public.applications a
      where a.id = application_events.application_id
        and (
          a.user_id = (select auth.uid())
          or is_member_of_opportunity_company(a.opportunity_id)
        )
    )
  );


-- ── notifications ───────────────────────────────────────────────────────────
-- No insert policy, deliberately: alerts are written by trigger or the
-- service role, never by the recipient.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (
    (select auth.uid()) = user_id or (select is_admin())
  );

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (
    (select auth.uid()) = user_id or (select is_admin())
  );


-- ── notification_preferences / push_subscriptions ───────────────────────────
-- Single FOR ALL policy each; no duplication to merge, only the per-row
-- auth.uid() call to hoist.
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- ── listing_reports ─────────────────────────────────────────────────────────
drop policy if exists listing_reports_select on public.listing_reports;
create policy listing_reports_select on public.listing_reports
  for select using (
    reported_by = (select auth.uid()) or (select is_admin())
  );

drop policy if exists listing_reports_insert on public.listing_reports;
create policy listing_reports_insert on public.listing_reports
  for insert with check (
    (select auth.uid()) is not null and reported_by = (select auth.uid())
  );

drop policy if exists listing_reports_update_admin on public.listing_reports;
create policy listing_reports_update_admin on public.listing_reports
  for update using ((select is_admin()));


-- ── admin_audit_log / ingestion_runs (operator-only reads) ──────────────────
drop policy if exists admin_audit_log_select on public.admin_audit_log;
create policy admin_audit_log_select on public.admin_audit_log
  for select using ((select is_admin()));

drop policy if exists ingestion_runs_select on public.ingestion_runs;
create policy ingestion_runs_select on public.ingestion_runs
  for select using ((select is_admin()));


-- ── foreign-key covering indexes ────────────────────────────────────────────
-- Plain `create index`, not `concurrently`: the migration runner wraps each
-- file in a transaction (so a failure rolls back rather than half-migrating),
-- and CONCURRENTLY cannot run inside one. These tables are small enough that
-- the brief lock is not worth giving up transactional migrations for.
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id);
create index if not exists application_events_actor_idx
  on public.application_events (actor_id);
create index if not exists applications_resume_idx
  on public.applications (resume_id);
create index if not exists companies_created_by_idx
  on public.companies (created_by);
create index if not exists companies_reviewed_by_idx
  on public.companies (reviewed_by);
create index if not exists listing_reports_reported_by_idx
  on public.listing_reports (reported_by);
create index if not exists listing_reports_reviewed_by_idx
  on public.listing_reports (reviewed_by);
create index if not exists mentors_user_idx
  on public.mentors (user_id);
create index if not exists opportunities_posted_by_idx
  on public.opportunities (posted_by);
create index if not exists opportunities_reviewed_by_idx
  on public.opportunities (reviewed_by);
