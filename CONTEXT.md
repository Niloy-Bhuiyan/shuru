# CONTEXT — Shuru production hardening

**Purpose of this file.** Session handoff. If you are a new session, read this
top to bottom before touching anything. It records verified state only: every
"pass" / "done" below was observed, not assumed.

**Last updated:** 2026-08-27 (session 1, discovery + baseline)

---

## 1. Objective

Take Shuru — an internship platform for Bangladesh-based students — from its
current working state to a complete, secure, production-ready application.
Real implementations only; the one permitted exception is payments, which may
use a clearly labelled sandbox provider.

**Shuru's defining product rule, which overrides convenience everywhere:**
never manufacture confidence the evidence does not support. No fabricated
match scores, deadlines, compensation, or delivery states. Abstention is a
first-class outcome.

---

## 2. Workspace

| | |
|---|---|
| Main checkout (untouched, on `main`) | `D:\SHURU Internship` |
| **Active worktree — do work here** | `D:\shuru-work` |
| Active branch | `production-hardening` |
| Branched from | `a44d4ad` (`main`) |
| Safety tag on pre-existing work | `safety/pre-hardening-2026-08-27` → `a44d4ad` |
| Remote | `origin` → `https://github.com/Niloy-Bhuiyan/shuru` (private) |
| Latest pushed commit on `production-hardening` | *(none yet — see §10)* |

**Why a sibling directory and not a nested worktree:** a git worktree placed
inside `D:\SHURU Internship` would appear as untracked content in the parent
repo and collide with the Next.js build output and `node_modules` resolution.
Sibling placement is the documented fallback.

`D:\shuru-work` has its own `node_modules` (installed from the committed
lockfile) and its own copy of `.env.local` (git-ignored, copied from the main
checkout — **not** committed).

### Git identity (verified)

```
user.name  = Niloy-Bhuiyan
user.email = 145592285+Niloy-Bhuiyan@users.noreply.github.com
```

Repository-local. Every commit uses this identity and no other. No AI is ever
listed as author or co-author. Never force-push. Never make the repo public.

---

## 3. Architecture as it actually exists

Next.js 14.2.35 App Router · React 18 · TypeScript strict · Tailwind + a
custom pixel design system · Supabase (Postgres, Auth, Storage, RLS).

There is currently **no separate backend service**. Server Components and
route handlers are the API layer; Postgres RLS is the authorization boundary.

```
src/
  app/(auth)/    login register onboarding verify-email forgot/reset-password
  app/(main)/    radar saved vault you opportunity mentors forge agent
                 notifications employer admin
  app/api/       agent cron explain forge-section ingest parse-resume
                 notifications/dispatch
  app/auth/callback/   OAuth code exchange
  components/pixel/    design primitives (the visual authority)
  components/forge/    resume builder
  lib/auth/      config (env detection, siteUrl, OAuth flags) + session (roles)
  lib/data/      one module per domain, client-side, RLS-scoped
  lib/ingest/    adapters (lever ashby adzuna keyless) + normalize dedupe
                 refresh health
  lib/agent/     provider adapter (gemini live, claude.ts is a THROWING STUB)
  lib/notify/    dispatch + email providers + web push
  lib/resume/    extract ats jdMatch pdfExport
  middleware.ts  session refresh + role-aware route guard
supabase/migrations/   0001..0010, forward-only, applied via scripts/migrate.mjs
```

### External services

| Service | Status |
|---|---|
| Supabase project `lciujpypigtbzhjawghf` | live, real user data |
| Vercel | connected to the GitHub repo (production deploy on `main`) |
| Google Gemini | code path complete, **no key set** — feature hides itself |
| Email (Resend / Postmark) | adapter complete, **no provider configured** |
| Web Push (VAPID) | keys set locally |
| Lever / Ashby / Arbeitnow / RemoteOK / Adzuna | ingestion adapters |

---

## 4. Environment variables (names + set/unset, never values)

Read from `D:\shuru-work\.env.local`.

| Variable | Local | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | set | required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set | required |
| `SUPABASE_SERVICE_ROLE_KEY` | set | server-only, bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | set | `http://localhost:3000` locally |
| `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` | set | |
| `NEXT_PUBLIC_OAUTH_GITHUB_ENABLED` | set | |
| `INGEST_SECRET` | set | guards POST /api/ingest and /api/notifications/dispatch |
| **`CRON_SECRET`** | **UNSET — see §7 P0-1** | `/api/cron` returns 503 without it |
| `INGEST_REMOTEOK_ENABLED` | set | |
| `INGEST_ARBEITNOW_ENABLED` | set | |
| `LEVER_COMPANIES` / `ASHBY_COMPANIES` | set | |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | empty | adapter inactive |
| `ADZUNA_COUNTRY` | set | |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | empty | AI entry points hide themselves |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | set | |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` | absent from `.env.local` | documented in the template |
| `SUPABASE_DB_URL` | absent from `.env.local` | only `npm run migrate` reads it |

---

## 5. Real database state (verified via Supabase MCP, 2026-08-27)

Project `lciujpypigtbzhjawghf`. 18 tables, **RLS enabled on all 18**.

| Table | Rows |
|---|---|
| profiles | 1 |
| user_roles | 1 |
| opportunities | 27 |
| applications | 2 |
| application_events | 6 |
| companies | 1 |
| employer_members | 1 |
| notifications | 1 |
| notification_preferences | 1 |
| ingestion_runs | 14 |
| schema_migrations | 10 |
| outcomes, interview_reports, mentors, resumes, listing_reports, admin_audit_log, push_subscriptions | 0 |

**Listing provenance is honest** — no illustrative seed data is loaded:
`arbeitnow` 18, `ashby` 8, `shuru` (employer/admin-posted) 1.

16 functions in `public`, all with `search_path=public` pinned. 6 are
`SECURITY DEFINER` and executable by `authenticated` — the RLS policy helpers
(`is_admin`, `is_employer`, `is_member_of_company`,
`is_member_of_opportunity_company`, `current_user_role`); the guard triggers
are `postgres` / `service_role` only. `anon` can execute none.

---

## 6. Verified baseline (2026-08-27, before any change)

| Gate | Result |
|---|---|
| `npm run typecheck` | **pass** (exit 0) |
| `npm run lint` | **pass** — no ESLint warnings or errors |
| `npm test` | **pass — 210/210, 26 files**, 14.5s |
| `npm run build` | not yet re-run this session |
| `npm run test:e2e` | not yet run this session |
| `npm audit` | **7 vulnerabilities (6 high, 1 moderate)** — all from `next` 14.2.35 + transitive `postcss`; only fix is a Next major |
| Supabase security advisors | 1 INFO, 6 WARN — see §7 |
| Supabase performance advisors | 29 `auth_rls_initplan` WARN, 15 `multiple_permissive_policies` WARN, 10 unindexed FK INFO, 8 unused-index INFO |

This baseline is genuinely healthy. The prior work is real and mostly
well-engineered; the job is to close the gaps below, not to rewrite it.

---

## 7. Prioritized plan

### P0 — verified defects and security

1. **`CRON_SECRET` is required by `/api/cron` but is in no env template.**
   `vercel.json` schedules `/api/cron?job=ingest` and `?job=dispatch`;
   `src/app/api/cron/route.ts` returns **503 `cron_not_configured`** when
   `CRON_SECRET` is unset. It is absent from `.env.local.example` *and* from
   `.env.local`. As shipped, **both scheduled jobs fail on every run.**
   Fix: add to the template with generation instructions, document in
   DEPLOYMENT, surface in a health check, cover with a test.
2. **Next.js 14.2.35 → 15.** Closes 6 high advisories with no 14.2.x backport
   (SSRF via rewrites / Server Actions, RSC cache poisoning, DoS,
   unauthenticated disclosure of internal Server Function endpoints). Breaking
   changes are scoped and known (async `cookies()` / `headers()` / `params` /
   `searchParams`).
3. **9,143-line seed dataset ships in the client bundle.**
   `src/lib/data/index.ts` is `"use client"` and imports `SEED_OPPORTUNITIES`
   from `src/lib/data/seed.ts` solely to build a ~20-entry id `Set` for
   `isSeededOpportunity()`. The whole illustrative dataset (opportunities,
   outcomes, reports, mentors) is therefore downloaded by every visitor.
   Fix: generate a tiny id-only module from the same generator.
4. **Supabase advisor remediation.** 29 RLS policies re-evaluate `auth.*()`
   per row (wrap in `(select …)`); 15 duplicate permissive policies on
   `applications` / `user_roles`; 10 unindexed foreign keys. Behaviour-
   preserving, forward-only migration + verification.
5. **Leaked-password protection is disabled** in Supabase Auth — dashboard
   action, see §11.

### P1 — subsystems the brief requires that do not exist yet

6. **Python AI service (absent).** A real REST service using LangChain +
   LangGraph with a production RAG pipeline (ingestion → normalization →
   chunking + metadata → embeddings → vector store → retrieval → citations →
   access control → evaluation → observability), authenticated integration
   with the Next.js app, prompt-injection defences for untrusted retrieved
   content, timeouts / retries / rate limits / cost controls, honest
   unavailable states, and tests for retrieval quality, grounding, citations
   and authorization boundaries.
7. **Payments (absent).** Clearly labelled sandbox / demo flow behind a
   provider adapter + webhook architecture. Server-authoritative, idempotent,
   signature-verified, never claiming real money moved, no raw card data.
8. **`src/lib/agent/claude.ts` is a throwing stub** and its branch in
   `adapter.ts` is disabled. Implement it properly under the provider
   abstraction.

### P2 — completeness, verification, docs

9. E2E coverage for employer / admin permission boundaries, OAuth edge cases,
   ingestion, notifications, payments sandbox, and the AI service.
10. Accessibility audit + automated checks; responsive visual QA at 390px and
    1440px.
11. Documentation refresh. `docs/ARCHITECTURE.md` is **stale**: it describes
    `lib/match/` (actually `lib/matching.ts`), `app/employer/` and `app/admin/`
    (actually under `app/(main)/`), `/api/cron/*` (actually `/api/cron`), and
    says push / email delivery is "architecture ready — delivery not enabled"
    when both were later fully wired.
12. `.env.local.example` is UTF-8 **with a BOM and mojibake** box-drawing
    characters — rewrite it clean.

---

## 8. Completed this session

- Full repository, git, database, advisor and dependency discovery.
- Verified baseline recorded in §6.
- Safety tag `safety/pre-hardening-2026-08-27` created on `a44d4ad`.
- Worktree `D:\shuru-work` on branch `production-hardening` created,
  dependencies installed from the committed lockfile, `.env.local` copied.
- This file.

## 9. Pending

Everything in §7.

## 10. Exact next step

Commit this file on `production-hardening` in `D:\shuru-work`, push the branch
to `origin`, then start P0-1 (`CRON_SECRET`).

## 11. Human actions still required (none blocking yet)

1. **Supabase Dashboard → Authentication → Policies → Password protection** —
   enable "Prevent use of leaked passwords" (HaveIBeenPwned). Not exposed
   through the MCP tools. Verify afterwards by re-running the security
   advisors: the `auth_leaked_password_protection` WARN disappears.

Further credential requirements (AI provider key, payment sandbox account,
email sending domain) will be listed here precisely when the code that needs
them is complete.

## 12. Accepted residual risks

- **No Content-Security-Policy.** A `unsafe-inline` CSP was deliberately not
  added; a real nonce-based CSP needs middleware work. Re-evaluate during the
  Next 15 upgrade (P0-2), which changes the relevant plumbing.
- **Rate limits are per-instance** (agent 20/day, ingest 15-min cooldown) —
  in-memory cost seatbelts, not security boundaries.
- **`schema_migrations` has RLS on with no policy** — intentional: only
  `service_role`, which bypasses RLS, touches the ledger.

## 13. Debugging discoveries worth not rediscovering

- **`middleware.ts` must live at `src/middleware.ts`**, not the repo root, or
  Next silently never loads it and every protected route serves
  unauthenticated. `npm run build` printing `ƒ Middleware` is the only cheap
  signal — read it.
- **RLS policies without table grants** produce `42501 permission denied` on
  every request. Policies are the fine gate, grants the coarse one; both are
  required. Migration `0007` supplies the grants.
- **Revoking `EXECUTE` from `anon` / `authenticated` is not enough** —
  Postgres grants it to `PUBLIC` by default and both roles inherit. Migration
  `0009` revokes `PUBLIC` explicitly; that is its entire reason to exist.
- **RemoteOK keeping 0 listings is correct**, not a broken filter — see
  `docs/decisions/0001-source-filtering.md` before touching `matchesFilters`.
- **Blank match scores on ingested listings are correct** — the engine
  abstains when a listing states too little. See
  `docs/decisions/0002-match-abstention.md`. Do not lower `MIN_COVERAGE`.
- **Vitest uses the `threads` pool deliberately** — `forks` failed
  intermittently on Windows past ~200 tests.
- **Playwright runs against a production build** on port 3100, not `next dev`,
  because dev-server cold compiles caused navigation flakiness.

## 14. Running local processes / ports

None started by this session. (`npm run dev` → 3000, Playwright → 3100.)
