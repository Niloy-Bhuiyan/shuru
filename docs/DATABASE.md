# Shuru — Database

Postgres on Supabase. Migrations live in `supabase/migrations/` and are the
source of truth; see `supabase/README.md` for how to run them.

---

## 1. Tables

### Identity and roles

| Table | Purpose |
|---|---|
| `auth.users` | Supabase-managed accounts |
| `user_roles` | one row per user: `student` \| `employer` \| `admin` |
| `profiles` | student profile: university, department, semester, CGPA, skills, work preferences, CV pointer |

A trigger on `auth.users` inserts a `student` role row at signup. `user_roles`
has **no self-write policy**, so a user cannot promote themselves.

### Employers

| Table | Purpose |
|---|---|
| `companies` | company details plus admin verification state |
| `employer_members` | many-to-many user ↔ company, with an `is_owner` flag |

### Internships

`opportunities` is the internship table. It keeps its original name because
every screen, seed row and test references it; the `opportunities_internship_only`
check constraint makes the internship-only rule explicit.

Columns group into:

- **identity** — company, role, location, duration, cycle_label
- **ownership** — `company_id`, `posted_by` (null for ingested rows)
- **moderation** — `status`, `rejection_reason`, `requested_changes`, reviewer
- **source** — `source`, `source_ref`, `source_url`, `apply_url`, `is_verified`
- **content** — `description`, `requirements`, `skills_required[]`, `work_mode`,
  `eligibility_rules` (jsonb)
- **compensation** — `is_paid` *and* `compensation_stated`, because "unpaid" and
  "the source didn't say" are different facts
- **freshness** — `first_seen_at`, `last_verified_at`, `expires_at`,
  `deadline_is_rolling`

### Applications

| Table | Purpose |
|---|---|
| `applications` | one row per (user, opportunity), current status, submission snapshot |
| `application_events` | append-only history of every status change |

Pipeline: `saved` → `applied` → `viewed` → `shortlisted` → `interview` →
`accepted` / `rejected`.

`application_events` is written **only by a trigger**. There is no insert
policy for any role, so history cannot be forged or edited.

### Notifications

| Table | Purpose |
|---|---|
| `notifications` | typed, prioritised, per-user messages |
| `notification_preferences` | per-user channel toggles, match floor, daily cap |

`emailed_at` and `pushed_at` are null until a sender actually runs — the
presence of a row never implies it was delivered anywhere but in-app.

### Moderation and operations

| Table | Purpose |
|---|---|
| `listing_reports` | user reports of fraudulent/stale/misleading listings |
| `admin_audit_log` | append-only record of admin actions |
| `ingestion_runs` | per-source run bookkeeping, including partial failures |

### Reality Check (pre-existing)

`outcomes`, `interview_reports`, `mentors`, `resumes` are unchanged from the
baseline apart from new RLS interactions.

---

## 2. Authorization

RLS is enabled on every table. The pattern throughout:

- **Owner-scoped rows** (profiles, applications, resumes, notifications):
  `auth.uid() = user_id`.
- **Employer-scoped rows**: membership is checked through
  `is_member_of_company()` / `is_member_of_opportunity_company()`, both
  `SECURITY DEFINER` so policies do not recurse.
- **Admin**: `is_admin()` widens read/write where moderation requires it.
- **Service role**: bypasses RLS for ingestion and scheduled jobs.

### Column-level rules use triggers, not policies

RLS grants or denies whole rows; it cannot protect individual columns. Where a
role may edit a row but not certain fields, a `BEFORE UPDATE` trigger reverts
the protected columns:

| Trigger | Protects |
|---|---|
| `guard_company_verification` | company review state |
| `guard_opportunity_moderation` | listing status, source, verification; sends materially-edited approved listings back to review |
| `guard_opportunity_insert` | forces employer submissions to start `pending` |
| `guard_application_transition` | who may set which status |
| `guard_notification_update` | recipients may only flip read state |

### The service-role subtlety

Triggers run even when RLS is bypassed. A service-role request has no
`auth.uid()`, so `is_admin()` is false for it — without care, ingestion would
have been rewritten to `status = 'pending', source = 'shuru'` by the insert
guard. Every guard therefore tests
`public.is_admin() or public.is_service_role()`, where `is_service_role()`
reads the JWT role claim from a session GUC (accurate even inside
`SECURITY DEFINER`).

### Self-tracking vs employer authority

A student may not set `viewed`/`shortlisted`/`interview`/`accepted`/`rejected`
on a listing an employer manages. For curated and ingested listings — which have
no `company_id` — self-reporting remains allowed, because the personal tracker
is the only record that exists for an application made off-platform.

---

## 3. Storage

Private bucket `resumes`. Objects are stored at `<user_id>/<filename>`, so the
first path segment is the owner and storage policies compare it to
`auth.uid()`.

---

## 4. Verification status

These migrations are structurally linted but have **not** been executed against
a live Postgres instance — no Supabase project was provisioned in this
workspace. Apply them to a scratch project and confirm success before
production use.
