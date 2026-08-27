# CONTEXT — Shuru production hardening

**Purpose of this file.** Session handoff. If you are a new session, read this
top to bottom before touching anything. It records verified state only: every
"pass" / "done" below was observed, not assumed.

**Last updated:** 2026-08-27 — session 1, after the P0 database / bundle /
secrets checkpoint.

---

## 1. Objective

Take Shuru — an internship platform for Bangladesh-based students — from its
current working state to a complete, secure, production-ready application.
Real implementations only; the one permitted exception is payments, which may
use a clearly labelled sandbox provider.

**Shuru's defining product rule, which overrides convenience everywhere:**
never manufacture confidence the evidence does not support. No fabricated
match scores, deadlines, compensation, or delivery states. Abstention is a
first-class outcome. That rule applies to this document too — if something
below is not verified, it says so.

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
| Latest commit | `3a04fff` tighten rls policies and table grants |

**Why a sibling directory and not a nested worktree:** a git worktree placed
inside `D:\SHURU Internship` would appear as untracked content in the parent
repo and collide with the Next.js build output and `node_modules` resolution.
Sibling placement is the documented fallback.

`D:\shuru-work` has its own `node_modules` (installed from the committed
lockfile) and its own copy of `.env.local` (git-ignored, copied from the main
checkout — **not** committed).

### Git identity (verified on every commit so far)

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
  lib/auth/      config (env detection, siteUrl, OAuth flags), session (roles),
                 secret (shared-secret compare for machine endpoints)
  lib/data/      one module per domain, client-side, RLS-scoped
  lib/ingest/    adapters (lever ashby adzuna keyless) + normalize dedupe
                 refresh health
  lib/agent/     provider adapter (gemini live, claude.ts is a THROWING STUB)
  lib/notify/    dispatch + email providers + web push
  lib/resume/    extract ats jdMatch pdfExport
  middleware.ts  session refresh + role-aware route guard
supabase/
  migrations/    0001..0012, forward-only, applied via scripts/migrate.mjs
  verify-rls.sql the database security gate (see §6)
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
| `CRON_SECRET` | **set (added this session)** | `/api/cron` returns 503 without it |
| `INGEST_REMOTEOK_ENABLED` | set | |
| `INGEST_ARBEITNOW_ENABLED` | set | |
| `LEVER_COMPANIES` / `ASHBY_COMPANIES` | set | |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | empty | adapter inactive |
| `ADZUNA_COUNTRY` | set | |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | empty | AI entry points hide themselves |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | set | |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` | absent from `.env.local` | documented in the template |
| `SUPABASE_DB_URL` | **absent** | needed by `npm run migrate` and `npm run verify:rls` — see §11 |

**`CRON_SECRET` must also be set in the Vercel environment**, or both
scheduled jobs 503 on every run. It is not in `.env.local.example`'s git
history before this session, so a deployment provisioned from the old template
will not have it.

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
| schema_migrations | 12 |
| outcomes, interview_reports, mentors, resumes, listing_reports, admin_audit_log, push_subscriptions | 0 |

**Listing provenance is honest** — no illustrative seed data is loaded:
`arbeitnow` 18, `ashby` 8, `shuru` (employer/admin-posted) 1.

16 functions in `public`, all with `search_path=public` pinned. 5 are
`SECURITY DEFINER` and callable by `authenticated` — the RLS policy helpers
(`is_admin`, `is_employer`, `is_member_of_company`,
`is_member_of_opportunity_company`, `current_user_role`); the guard triggers
are `postgres` / `service_role` only. `anon` can execute none.

**Grants after migration 0012:** `anon` has **no table privileges at all**;
`authenticated` has SELECT 17 / INSERT 10 / UPDATE 10 / DELETE 9 and zero
TRUNCATE / REFERENCES / TRIGGER; `service_role` retains ALL on 18.

---

## 6. Gates and their latest observed results

| Gate | Baseline (start of session) | Now |
|---|---|---|
| `npm run typecheck` | pass | **pass** |
| `npm run lint` | pass | **pass** |
| `npm test` | pass — 210/210, 26 files | **pass — 227/227, 28 files** |
| `npm run build` | not run | **pass**, exit 0, prints `ƒ Middleware` |
| `npm run verify:rls` | did not exist | **10/10 PASS** (run via MCP against the live DB; the npm script itself is unrun — needs `SUPABASE_DB_URL`, §11) |
| `npm run test:e2e` | not run | **still not run this session** |
| `npm audit` | 7 vulns (6 high, 1 moderate) | unchanged — all from `next` 14.2.35 + transitive `postcss`; only fix is a Next major |
| Supabase security advisors | 1 INFO, 6 WARN | 1 INFO, 6 WARN (5 are the intended policy helpers; 1 is the dashboard action in §11) |
| Supabase performance advisors | 29 + 15 WARN, 10 + 8 INFO | **0 WARN**; only `unused_index` INFO remains |

---

## 7. Completed this session

1. **Discovery and baseline** — full repository, git, database, advisor and
   dependency inventory. Recorded above.
2. **Safety** — tag `safety/pre-hardening-2026-08-27` on `a44d4ad`; isolated
   worktree on branch `production-hardening`.
3. **`53cd039` harden secret compare and add cron secret to env template**
   - New `src/lib/auth/secret.ts`: `secretsMatch` compares SHA-256 digests via
     `timingSafeEqual`, so neither the content nor the length of a secret is
     observable from timing. `/api/ingest` and `/api/notifications/dispatch`
     were using plain `===`; `/api/cron` had its own hand-rolled comparator.
     All three now share one helper. An **empty expected secret never
     matches**, so a deployment that forgot the variable cannot authenticate
     everyone.
   - `.env.local.example` rewritten: it was UTF-8 **with a BOM and mojibake**
     box-drawing characters. Now clean ASCII, and it documents `CRON_SECRET`.
   - 14 new tests.
   - *Scope correction from the first pass:* `CRON_SECRET` **was** already
     documented in `docs/DEPLOYMENT.md` (credentials row 11 plus an explicit
     warning). The gap was only the `.env.local.example` entry and the local
     `.env.local`. Both fixed.
4. **`44a488b` keep seed dataset out of the client bundle**
   - `src/lib/data/index.ts` is `"use client"` and imported the 9,143-line
     `seed.ts` only to build an id `Set`. `scripts/generate-seed.mjs` now also
     emits a 38-line `src/lib/data/seedIds.ts`, which is what the app imports.
   - **Measured, not assumed:** with the old import, production chunk
     `8661-*.js` contained the seed-only string `Nextern Intern`; after, no
     chunk does. Static chunk bytes 2,111,603 → 2,101,568 = **10,035 bytes**.
     That is smaller than the raw file suggests because webpack tree-shook the
     unused `SEED_OUTCOMES` / `SEED_REPORTS` / `SEED_MENTORS` exports — only
     `SEED_OPPORTUNITIES` was actually reachable. Real, but ~10 KB, not the
     hundreds of KB the line count implies.
   - 3 new tests, including one that fails if any non-test module imports
     `@/lib/data/seed` again.
5. **`3a04fff` tighten rls policies and table grants**
   - Migration `0011`: wrapped `auth.uid()` / `auth.role()` / `is_admin()` /
     `is_employer()` in scalar subqueries so they hoist to an InitPlan instead
     of re-evaluating per row; merged the duplicate permissive policies on
     `applications` (SELECT, UPDATE) and split the FOR ALL policy on
     `user_roles` that was shadowing SELECT; added the 10 missing FK indexes.
     Behaviour-preserving. **Result: all 29 `auth_rls_initplan` and all 15
     `multiple_permissive_policies` warnings cleared.**
   - Migration `0012`: least-privilege grants. Found by the new gate —
     `anon` held **TRUNCATE**, REFERENCES and TRIGGER on `push_subscriptions`
     (created by 0010, after 0007's blanket revoke), and `authenticated` held
     the same three on **all 17** tables (0007 granted DML additively and never
     revoked the Supabase default ALL). **TRUNCATE is not subject to RLS.**
     Honest scope: not reachable through the public HTTP API — PostgREST
     exposes no TRUNCATE verb — so this was a latent least-privilege violation,
     not a live breach. Also revoked every DML privilege that had no matching
     policy, and set default privileges so a future table cannot reintroduce
     it.
   - New `supabase/verify-rls.sql` + `scripts/verify-rls.mjs` +
     `npm run verify:rls`: ten database invariants, exits non-zero on failure.
     Written as invariants rather than counts on purpose — `docs/RUNBOOK.md`
     §2 previously carried a hand-maintained grant tally that had already gone
     stale (it said 16 tables; there are 18).
   - `docs/RUNBOOK.md` §1 and §2 rewritten accordingly (§1 also said "all four
     must pass" above a list of five).

**Both migrations are applied to the live database and verified there.**

---

## 8. Pending — in priority order

### P0 (remaining)

1. **Next.js 14.2.35 → 15.** Closes 6 high advisories with no 14.2.x backport
   (SSRF via rewrites / Server Actions, RSC cache poisoning, DoS,
   unauthenticated disclosure of internal Server Function endpoints). Breaking
   changes are scoped and known (async `cookies()` / `headers()` / `params` /
   `searchParams`). Re-evaluate the CSP decision (§12) while in there.
2. **Enable leaked-password protection** — dashboard action, §11.

### P1 — subsystems the brief requires that do not exist at all

3. **Python AI service.** Real REST service using LangChain + LangGraph with a
   production RAG pipeline (ingestion → normalization → chunking + metadata →
   embeddings → vector store → retrieval → citations → access control →
   evaluation → observability), authenticated integration with the Next.js
   app, prompt-injection defences for untrusted retrieved content, timeouts /
   retries / rate limits / cost controls, honest unavailable states, and tests
   for retrieval quality, grounding, citations and authorization boundaries.
4. **Payments.** Clearly labelled sandbox flow behind a provider adapter +
   webhook architecture. Server-authoritative, idempotent, signature-verified,
   never claiming real money moved, no raw card data.
5. **`src/lib/agent/claude.ts` is a throwing stub** and its branch in
   `adapter.ts` is disabled. Implement it under the provider abstraction.

### P2 — completeness and verification

6. E2E coverage for employer / admin permission boundaries, OAuth edge cases,
   ingestion, notifications, payments sandbox, and the AI service.
7. Accessibility audit + automated checks; responsive visual QA at 390px and
   1440px.
8. `docs/ARCHITECTURE.md` is **stale** and not yet fixed: it describes
   `lib/match/` (actually `lib/matching.ts`), `app/employer/` and `app/admin/`
   (actually under `app/(main)/`), `/api/cron/*` (actually `/api/cron`), and
   says push / email delivery is "architecture ready — delivery not enabled"
   when both were later fully wired.

---

## 9. Exact next step

Push the three commits to `origin/production-hardening` (not yet pushed since
`8113d00`), then begin P0-1, the Next.js 15 upgrade, in `D:\shuru-work`.

---

## 10. Running local processes / ports

None left running by this session. (`npm run dev` → 3000, Playwright → 3100.)

---

## 11. Human actions still required

Neither is blocking further work.

1. **Supabase Dashboard → Authentication → Policies → Password protection** —
   enable "Prevent use of leaked passwords" (checks HaveIBeenPwned). Not
   exposed through the MCP tools. **Verify afterwards** by re-running the
   security advisors: the `auth_leaked_password_protection` WARN disappears.
2. **`SUPABASE_DB_URL` in `.env.local`** — Supabase Dashboard → Project
   Settings → Database → Connection string → URI, with `[YOUR-PASSWORD]`
   replaced. Needed by `npm run migrate` and `npm run verify:rls`. Without it
   the RLS gate can still be run by pasting `supabase/verify-rls.sql` into the
   SQL Editor (which is how it was verified this session). **Verify
   afterwards** with `npm run verify:rls` — expect `10/10 checks passed`.

Credentials for the AI provider, payment sandbox and email sending domain will
be listed here precisely once the code that needs them exists.

---

## 12. Accepted residual risks

- **`npm audit`: 6 high + 1 moderate**, all `next` 14.2.35 and transitive
  `postcss`, with no 14.2.x backport. Being addressed by P0-1.
- **No Content-Security-Policy.** A `unsafe-inline` CSP was deliberately not
  added; a real nonce-based CSP needs middleware work. Re-evaluate during the
  Next 15 upgrade.
- **Rate limits are per-instance** (agent 20/day, ingest 15-min cooldown) —
  in-memory cost seatbelts, not security boundaries.
- **`schema_migrations` has RLS on with no policy** — intentional: only
  `service_role`, which bypasses RLS, touches the ledger. It is the single
  documented exemption in `verify-rls.sql`.
- **`unused_index` advisories** — 18 of them, including the 10 FK indexes
  added by 0011. Expected on a database with 27 rows in its largest table; not
  actionable.

---

## 13. Debugging discoveries worth not rediscovering

- **`middleware.ts` must live at `src/middleware.ts`**, not the repo root, or
  Next silently never loads it and every protected route serves
  unauthenticated. `npm run build` printing `ƒ Middleware` is the only cheap
  signal — read it.
- **RLS policies without table grants** produce `42501 permission denied` on
  every request. Policies are the fine gate, grants the coarse one; both are
  required.
- **Revoking `EXECUTE` from `anon` / `authenticated` is not enough** —
  Postgres grants it to `PUBLIC` by default and both roles inherit. Migration
  `0009` revokes `PUBLIC` explicitly; that is its entire reason to exist.
- **Supabase's default privileges re-grant ALL on every newly created table**
  to `anon` and `authenticated`. A blanket revoke in one migration does not
  protect a table created by a later one — which is exactly how
  `push_subscriptions` ended up with `anon` TRUNCATE. `0012` sets
  `alter default privileges` so this cannot recur.
- **`check` is a reserved word** in `select check, …` — the verify-rls query
  uses `check_name`.
- **`globSync` is not in `@types/node` 20** (Node 22+). Walk directories with
  `readdirSync(dir, { withFileTypes: true })` instead.
- **RemoteOK keeping 0 listings is correct**, not a broken filter — see
  `docs/decisions/0001-source-filtering.md` before touching `matchesFilters`.
- **Blank match scores on ingested listings are correct** — the engine
  abstains when a listing states too little. See
  `docs/decisions/0002-match-abstention.md`. Do not lower `MIN_COVERAGE`.
- **Vitest uses the `threads` pool deliberately** — `forks` failed
  intermittently on Windows past ~200 tests.
- **Playwright runs against a production build** on port 3100, not `next dev`,
  because dev-server cold compiles caused navigation flakiness.
