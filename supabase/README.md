# Supabase — migrations

Run these in the Supabase SQL Editor, **in filename order**.

| File | What it adds |
|---|---|
| `0001_baseline.sql` | profiles, opportunities, applications, outcomes, interview_reports, mentors, resumes + their original RLS |
| `0002_roles_and_employers.sql` | `user_role` enum, `user_roles`, role helper functions, companies, employer membership |
| `0003_internship_lifecycle.sql` | moderation state, source attribution, freshness/expiry, structured requirement fields on `opportunities` |
| `0004_application_pipeline.sql` | widened application statuses, `application_events` history, transition guards |
| `0005_notifications.sql` | `notifications`, `notification_preferences`, automatic status-change alerts |
| `0006_moderation_ingestion_profiles.sql` | `listing_reports`, `admin_audit_log`, `ingestion_runs`, profile match fields, private CV storage bucket |

## Fresh project

Run `0001` → `0006` in order, then `seed.sql` if you want the reference
Bangladesh listings and outcome history.

## Existing project

If your database already ran the original `schema.sql`, that file is now
`0001_baseline.sql` — **skip it** and start at `0002`.

`migration_resume_forge.sql` is a historical migration kept for projects that
predate the Resume Forge release. It is already included in `0001_baseline.sql`;
do not run both.

## Re-running

Every migration is written to be idempotent — `if not exists`, guarded
`do $$ … exception when duplicate_object $$` blocks, and
`drop policy if exists` before each `create policy`. Re-running a migration is
safe and is the intended way to apply a policy change.

## Making an admin

There is deliberately no way to grant yourself the admin role through the API:
`user_roles` has no self-write policy. Promote the first admin from the SQL
Editor:

```sql
update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'you@example.com');
```

Employer accounts are granted the same way (`role = 'employer'`), or by an
existing admin through the admin dashboard.

## Verification status

These migrations are structurally linted but have **not** been executed against
a live Postgres instance in this workspace — no Supabase project was
provisioned. Run them against a scratch project first and confirm each file
reports success before pointing production at them.
