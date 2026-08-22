# Shuru — Architecture

**Last updated:** 2026-08-22

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict) |
| Styling | Tailwind, custom pixel design system in `globals.css` |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password, Google OAuth, GitHub OAuth) |
| Storage | Supabase Storage (CV/resume files) |
| Authorization | Postgres Row Level Security, enforced in the database |
| Scheduled work | HTTP cron endpoints under `/api/cron/*`, secret-protected |
| Tests | Vitest |

## 2. Runtime shape

```
Browser
  │
  ├── Server Components ─────────► Supabase (user session, RLS-scoped)
  │
  ├── Route Handlers /api/* ─────► Supabase (session or service-role)
  │                                 └── external adapters (Lever, Ashby, …)
  │
  └── middleware.ts ─────────────► session refresh + role-aware route guard
```

There is no separate backend service. Server Components and Route Handlers are
the API layer; Postgres RLS is the authorization boundary.

## 3. Directory map

```
src/
  app/
    (auth)/          login, register, verify, forgot, reset, oauth callback
    (main)/          student surfaces (radar, opportunity, saved, vault, you)
    employer/        employer workspace
    admin/           admin dashboard
    api/             route handlers
      cron/          scheduled jobs (secret-protected)
  components/
    pixel/           design primitives — the visual authority
    forge/           resume builder
  lib/
    auth/            session + role helpers
    data/            data access, one module per domain
    ingest/          adapter registry, normalization, dedupe, refresh
    match/           resume ↔ internship matching engine
    notify/          notification creation + prioritization
    resume/          parsing, ATS scoring, PDF export
supabase/
  migrations/        ordered, additive SQL migrations
docs/
```

## 4. Authorization model

Three roles live in `public.user_roles`, defaulting to `student`.

Authorization is enforced in **three layers**, each independently sufficient
for its own scope:

1. **Database (primary).** RLS policies decide row visibility and mutation
   rights. A leaked anon key still cannot read another student's applications.
2. **Middleware.** Refreshes the session and redirects by role before a
   protected page renders — a UX and defence-in-depth layer, not the boundary.
3. **Route handlers.** Re-check the caller's role server-side before any
   privileged mutation, because middleware can be bypassed by direct API calls.

The `service_role` key bypasses RLS and is used only in server-side ingestion,
scheduled jobs, and admin operations that are already role-checked. It is never
exposed to the browser.

## 5. Ingestion pipeline

```
adapter.fetch()          per source; network-isolated, timeout-bounded
  → toRawListings()      source shape → RawListing
  → internshipFilter()   internship-family only; seniority excluded
  → normalize()          one canonical Internship shape
  → dedupe()             deterministic ID; cross-source near-duplicate merge
  → freshness()          expiry + re-verification stamps
  → upsert               onConflict: id — refresh updates, never duplicates
```

Adapters implement one interface and self-report availability, so a source
without credentials is inactive rather than failing. A source that is
unreachable degrades the run, it does not fail it: partial ingestion is
recorded in `ingestion_runs` with per-source counts and errors.

**Honesty rules encoded in the pipeline:**
- A source without a real deadline yields a rolling window, labelled as such —
  never a fabricated hard deadline.
- Compensation is stated only with evidence; otherwise "not stated by source".
- Ingested listings carry no historical outcome data, so Reality Check abstains
  on them automatically.

## 6. Matching engine

Pure functions over `(Profile, ResumeContent, Internship) → MatchResult`.
No network calls, no AI dependency, fully unit-testable.

Signals: skills overlap, education fit, experience relevance, keyword
coverage, location/work-mode compatibility, eligibility rules, and project
evidence. Each contributing signal carries the evidence that produced it, so
the UI can show *why* — and the engine returns an abstention when the resume
or the listing carries too little information to justify a number.

## 7. Notifications

Notifications are rows, not pushes. Creation is decoupled from delivery:

```
event (application status change, new listing, deadline approaching)
  → notify.create()      typed row in public.notifications
    → in-app center      (ships now)
    → browser push       (architecture ready — delivery not enabled)
    → email              (architecture ready — delivery not enabled)
```

Internship alerts are ranked by match quality × deadline proximity ×
freshness, and capped per type per window, so relevance beats volume.

## 8. Configuration

Every external dependency is environment-gated and self-reporting. A missing
optional key disables its feature visibly rather than faking it. Supabase is
the one hard requirement: without it the app renders an explicit configuration
state instead of a simulated backend.
