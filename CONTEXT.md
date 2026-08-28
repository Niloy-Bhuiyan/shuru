# CONTEXT — Shuru production hardening

**Purpose of this file.** Session handoff. If you are a new session, read this
top to bottom before touching anything. It records verified state only: every
"pass" / "done" below was observed, not assumed.

**Last updated:** 2026-08-28 — session 1. **PRODUCTION IS LIVE AND SIGN-IN WORKS.**

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
| Branch | merged into `main` and deployed |
| Production | **https://shuru-ten.vercel.app — live and configured** |

### Deployment state (verified 2026-08-28)

`main` was fast-forwarded from `production-hardening` and deployed. Before this
session the Vercel project had **only** `GEMINI_API_KEY` and `GEMINI_MODEL`
set, so the public URL served the "NOT CONFIGURED" screen and `/radar`
returned 200 instead of a redirect. 18 further variables are now set on
Production.

Verified live after deploy:

| Check | Result |
|---|---|
| `/login` | 200, real form (no longer NOT CONFIGURED) |
| `/radar` signed out | **307** → the middleware guard is active |
| Security headers | all five present; `x-powered-by` absent |
| `/api/ingest`, `/api/notifications/dispatch` anonymous | 401 |
| unsigned `POST /api/payments/webhook` | 400 |
| `GET /api/ask` anonymous | 401 |
| `/api/cron` wrong secret / unknown job / valid | 401 / 400 / **200** |
| real ingest run | fetched 1470, kept 13, 12 upserted |

**Preview environment is NOT configured** — `vercel env add ... preview`
needs a `--git-branch` and failed non-interactively. Production only. Preview
deployments will show the NOT CONFIGURED screen, which is the safe direction.

**`vercel env pull` redacts encrypted values** — every variable reads back as
`""`, including ones that demonstrably work. Do not use it to audit whether a
value is set; it is not evidence of emptiness.

**Why a sibling directory and not a nested worktree:** a git worktree placed
inside `D:\SHURU Internship` would appear as untracked content in the parent
repo and collide with the Next.js build output and `node_modules` resolution.
Sibling placement is the documented fallback.

`D:\shuru-work` has its own `node_modules` (installed from the committed
lockfile) and its own copy of `.env.local` (git-ignored, copied from the main
checkout — **not** committed).

### ⚠ `main` HAS MOVED — read before merging

This branch was cut from `a44d4ad`. The repository owner has since committed
**four documentation changes directly to `main`**:

```
af4811b docs: refresh architecture diagram cache
afc059c docs: polish README architecture and license
d0733c8 docs: simplify README and add proprietary license
4834565 docs: redesign project README
```

`README.md` was rewritten on both sides, so **a merge will conflict there**.
Their `main` version is the owner's deliberate redesign and should win on
structure; the additions from this branch that must survive are the
`services/rag` doc-table row, the ADR 0003 link, the `verify:rls` and pytest
script rows, and the Next 16 / Python service line in the stack blurb.

**Nothing on this branch is deployed.** Vercel builds `main`. A merge is a
production-facing action and has NOT been done — it is waiting on an explicit
go-ahead.

### Git identity (verified on every commit so far)

```
user.name  = Niloy-Bhuiyan
user.email = 145592285+Niloy-Bhuiyan@users.noreply.github.com
```

Repository-local. Every commit uses this identity and no other. No AI is ever
listed as author or co-author. Never force-push. Never make the repo public.

---

## 3. Architecture as it actually exists

Next.js **16.3.3** App Router · React 18.3.1 · TypeScript strict · Tailwind +
a custom pixel design system · Supabase (Postgres, Auth, Storage, RLS).

Two services: the Next.js app, and a Python retrieval service under
`services/rag`. Server Components and route handlers are the web API layer;
Postgres RLS is the authorization boundary for the database.

```
src/
  app/(auth)/    login register onboarding verify-email forgot/reset-password
  app/(main)/    radar saved vault you opportunity mentors forge agent
                 notifications employer admin
  app/api/       agent ask cron explain forge-section ingest parse-resume
                 notifications/dispatch
  app/auth/callback/   OAuth code exchange
  components/pixel/    design primitives (the visual authority)
  components/forge/    resume builder
  lib/auth/      config (env detection, siteUrl, OAuth flags), session (roles),
                 secret (shared-secret compare for machine endpoints)
  lib/data/      one module per domain, client-side, RLS-scoped
  lib/ingest/    adapters (lever ashby adzuna keyless) + normalize dedupe
                 refresh health
  lib/agent/     provider adapter — BOTH gemini and claude implemented
  lib/rag/       server-only client for the Python retrieval service
  lib/notify/    dispatch + email providers + web push
  lib/resume/    extract ats jdMatch pdfExport
  middleware.ts  session refresh + role-aware route guard
supabase/
  migrations/    0001..0013, forward-only, applied via scripts/migrate.mjs
  verify-rls.sql the database security gate (see §6)
services/rag/    FastAPI + LangGraph + LangChain + pgvector retrieval service
  app/           config chunking security embeddings db graph main ratelimit
  tests/         63 pytest tests, no database or credentials needed
```

### External services

| Service | Status |
|---|---|
| Supabase project `lciujpypigtbzhjawghf` | live, real user data |
| Vercel | connected to the GitHub repo (production deploy on `main`) |
| Google Gemini | code path complete, **no key set** — feature hides itself |
| Anthropic | provider implemented, **no key set** — feature hides itself |
| Python retrieval service | implemented + tested, **not deployed** — needs a host and `SUPABASE_DB_URL` (§11) |
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
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | **absent** | preferred over Gemini when set |
| `SHURU_RAG_URL` / `SHURU_RAG_SERVICE_TOKEN` | **absent** | `/api/ask` reports itself unavailable |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | set | |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` | absent from `.env.local` | documented in the template |
| `SUPABASE_DB_URL` | **absent** | needed by `npm run migrate` and `npm run verify:rls` — see §11 |

**`CRON_SECRET` must also be set in the Vercel environment**, or both
scheduled jobs 503 on every run. It is not in `.env.local.example`'s git
history before this session, so a deployment provisioned from the old template
will not have it.

---

## 5. Real database state (verified via Supabase MCP, 2026-08-27)

Project `lciujpypigtbzhjawghf`. **19** tables, **RLS enabled on all 19**.

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
| schema_migrations | 13 |
| rag_chunks | 0 — **not yet indexed**, needs `SUPABASE_DB_URL` (§11) |
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
TRUNCATE / REFERENCES / TRIGGER; `service_role` retains ALL. Migration 0013
adds `rag_chunks` following the same rules (read-only for `authenticated`,
nothing for `anon`, **no write policy at all**).

---

## 6. Gates and their latest observed results

| Gate | Baseline (start of session) | Now |
|---|---|---|
| `npm run typecheck` | pass | **pass** |
| `npm run lint` | pass | **pass — 0 errors**, 19 warnings (see §12) |
| `npm test` | pass — 210/210, 26 files | **pass — 271/271, 31 files** |
| `npm run build` | not run | **pass**, exit 0, prints `ƒ Proxy (Middleware)` |
| `npm run test:e2e` | not run | **pass — 114/114** (mobile 390px + desktop 1440px, production build) |
| `npm audit` | 7 vulns (6 high, 1 moderate) | **0 vulnerabilities** |
| `pytest` (services/rag) | did not exist | **pass — 63/63** |
| WCAG AA contrast (public pages) | **12 failures** | **0 failures** |
| `npm run verify:rls` | did not exist | **10/10 config invariants + 6 behaviour tests PASS** (run via MCP against the live DB; the npm script itself is unrun — needs `SUPABASE_DB_URL`, §11) |
| Supabase security advisors | 1 INFO, 6 WARN | 1 INFO, 6 WARN (5 are the intended policy helpers; 1 is the dashboard action in §11) |
| Supabase performance advisors | 29 + 15 WARN, 10 + 8 INFO | **0 WARN**; only `unused_index` INFO remains |

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

6. **`3fc3048` upgrade to next 16 and clear all dependency advisories**
   - `next` 14.2.35 -> **16.3.3**. Next 15 was *not* enough: the advisory range
     is `9.3.4-canary.0 - 16.3.0-preview.10`, so only 16.3.0+ closes it.
     React stayed at 18.3.1 — Next 16 still lists `^18.2.0` as a valid peer, so
     the React 19 migration was not needed and was not done.
   - Migration surface turned out to be tiny: every dynamic route is a client
     component using `useParams()`, and there is exactly **one** server
     component and **one** `cookies()` call. `supabaseServer()` is now async;
     7 call sites await it. `experimental.serverComponentsExternalPackages` ->
     top-level `serverExternalPackages`.
   - ESLint 8 -> 9 with flat config (`eslint.config.mjs`), `eslint-config-next`
     16, and `next lint` -> `eslint .` (removed in Next 16).
   - Next 16's ruleset surfaced 27 new errors. **9 were real defects and were
     fixed**: a component declared inside `ResumePreview`'s render body
     (remounted its subtree every render), and undo/redo `disabled` plus a
     skills-draft input read from refs during render (untracked by React).
     The other 18 are `set-state-in-effect` — see §12.
   - `npm audit`: **7 -> 0**, after also bumping `postcss` and `dompurify`.
7. **`6d11aec` implement the claude provider behind the agent adapter**
   - `src/lib/agent/claude.ts` was a throwing stub with its adapter branch
     commented out. It is now a real provider on the official
     `@anthropic-ai/sdk`, with pure translation functions unit-tested the same
     way `gemini.ts`'s are (15 tests).
   - The load-bearing detail: consecutive `tool_result` messages must merge
     into ONE user turn. Emitting one turn each reads as several separate human
     turns and degrades multi-turn tool use.
   - A refusal raises rather than returning empty text, because "" would read
     to the caller as "nothing to say" instead of "declined".
   - Precedence when both keys are set: Anthropic. Not a quality ranking —
     Gemini's free tier makes it the easy key to leave lying around, so an
     explicitly-added Anthropic key is the more deliberate signal.
8. **`1b7be23` add python retrieval service with cited answers and abstention**
   - `services/rag/`: FastAPI + LangGraph + LangChain + pgvector, 63 tests.
   - **Product need it solves:** the structured columns were already queryable;
     the 4,000-char job descriptions were not. Of 27 listings, **5** carry
     indexable prose — so abstaining on the other 22 is the expected behaviour.
   - **LangGraph is not decoration:** the pipeline has three abstain exits and
     one self-rejection (`verify_grounding` discards a draft that cites
     nothing). As nested ifs, that is where an early return silently skips the
     grounding check.
   - Vector store is the **same Supabase Postgres** (migration `0013`,
     `public.rag_chunks`, HNSW + cosine). No new infrastructure; the chunk ->
     listing FK cascades.
   - Embeddings run **locally** via fastembed ONNX (BAAI/bge-small-en-v1.5,
     384-dim) — a real model, no API key, so retrieval is verifiable by anyone
     who clones the repo. Only the written answer needs a hosted credential.
   - Prompt-injection defence in three layers (fenced documents, delimiter
     sanitising, advisory detection that never blocks). `rag_chunks` has no
     write policy, so no user can inject retrievable text.
   - Next.js integration: `src/lib/rag/client.ts` (server-only) +
     `/api/ask` (session-verified; the user id comes from the session, never
     the request body, so a client cannot spend another student's quota).

**Both database migrations and `0013` are applied to the live database and
verified there.**

9. **`cc5efa1` meet wcag aa contrast on light surfaces**
   - An audit of the signed-out surface found **12 WCAG AA contrast
     failures**, all from three palette tokens used as TEXT on the cream
     background: `grey` #8A8578 at **3.07:1**, `amber` #FF7A3C at **2.16:1**,
     `alert` #E5533D at **3.10:1**, against a 4.5:1 requirement.
   - `grey` was darkened to `#6B6659` outright (4.77:1 / 5.23:1). It is only
     ever secondary text or a muted fill, and darkening improved BOTH
     directions — cream-on-grey went 3.07 -> 4.77, so those 13 `bg-grey`
     usages got better too.
   - `amber` and `alert` were NOT changed: they are tuned as FILLS
     (`bg-amber text-ink` is correct) and are fine as text on the dark forge
     and terminal surfaces. Instead two new tokens, `amberInk` #B4400F and
     `alertInk` #B33A28, were added for text-on-light, and **only the 22
     usages verified to sit on cream/paper** were swapped. The 24 remaining
     `text-amber` usages are all on dark surfaces and were left alone.
   - Three standalone links (16px tall) were padded to ~28px for WCAG 2.2 AA
     2.5.8. Two others were left alone deliberately — they sit inline in a
     sentence, which the spec exempts.
   - New `e2e/a11y.spec.ts`: 6 checks x 4 public pages x 2 viewports = **48
     tests** covering contrast, landmark/heading structure, `html[lang]`, form
     labelling, focus visibility, and target size.
   - **A follow-up sweep of the DARK surfaces** (which the browser audit could
     not reach, since the forge and terminal screens need a session) found two
     more failures by computing every palette pair directly:
     `text-cream` on `bg-alert` at **3.10:1** — used in ~26 places — and
     `fviolet` on `fslate` at 4.05:1.
   - `alert` was therefore darkened #E5533D -> **#B33A28**, which fixes both
     directions at once (4.92:1 as a fill under cream text, 4.92:1 as text on
     cream). That let the earlier `alertInk` token be **removed** — one value
     does both jobs. Amber genuinely cannot: `text-ink` on #FF7A3C is 5.63:1
     but on #B4400F only 2.56:1, so bright-enough-to-carry-dark-text and
     dark-enough-to-be-read-on-cream are mutually exclusive there. That
     asymmetry is why amber is split and alert is not, and it is written into
     the config so it does not look like an inconsistency later.
   - `fviolet` turned out to have **zero usages** — a dead token. Left in
     place with a comment recording its measurement rather than deleted.
   - Final state: **all 19 colour pairs in real use pass WCAG AA.**

10. **`2658865` add rls behaviour tests that assert the exact denial code**
   - New `supabase/test-rls.sql`. `verify-rls.sql` checks the *shape* of the
     security config; this checks what the policies actually **do**, by
     becoming each role with a synthetic JWT `sub` — exactly what PostgREST
     does per request — and looking. Non-destructive: creates and deletes
     nothing.
   - Covers stranger isolation across 11 tables, public visibility (approved +
     unexpired only, and `rag_chunks` never out-reaching its listings),
     own-row read as a positive control, no self-promotion, no cross-user
     write, and that `payments` has zero UPDATE policies.
   - **A draft of this file passed for the wrong reason and was caught.** The
     cross-user write test caught `others`, and the INSERT it ran named a
     column that does not exist — so it failed with 42703 (undefined_column)
     and the test counted that as a successful RLS block. Both negative tests
     now assert **SQLSTATE 42501 specifically**. Re-verified against the live
     database: both denials are genuinely 42501, "new row violates row-level
     security policy".
   - `npm run verify:rls` now runs both files; `npm run test:rls` runs the
     behaviour half.

11. **Retrieval service runs without a database password.**
   `SHURU_RAG_DATABASE_URL` needs the Postgres password, which is **not
   derivable** from the service-role key or the management API — so the
   service was unrunnable for anyone who had every other credential. Added a
   PostgREST backend (`app/rest_store.py`) selected by `app/store.py`, plus
   migration `0015`'s `match_rag_chunks` RPC for the one thing PostgREST
   cannot express (`order by embedding <=> query`). Deliberately SECURITY
   **INVOKER**, so RLS still applies and it does not trip the
   SECURITY-DEFINER invariant in `verify-rls.sql`.
12. **The corpus is indexed and retrieval is verified against it.**
   27 chunks across 5 listings; 24 listings skipped because they publish no
   prose — the expected outcome, not a gap.
13. **The abstention threshold was measured, and the shipped default was
   wrong.** It was 0.75, which admitted *every* off-topic question — "what is
   the weather in Dhaka?" scored 0.598 and would have been answered from a
   Notion job description. Measured on-topic 0.239-0.385 vs off-topic
   0.532-0.598, a clean 0.147 gap, so it is now **0.46**.
   `tests/test_threshold.py` pins the measurement and includes a test proving
   the old default would fail the suite.
14. **Test isolation bug found and fixed.** Creating `services/rag/.env` broke
   `test_an_unset_token_refuses_rather_than_running_open` — the test's
   `monkeypatch.delenv` was being undone by the file underneath it. Added
   `tests/conftest.py` disabling the env file for the session; the suite now
   passes identically with and without a local `.env`.

**Verified with evidence, not assumed:**
- The pgvector SQL path was probed against the live database with synthetic
  unit vectors: identical vector -> distance `0.0000`, 45-degree vector ->
  `0.2929` (exactly 1 - cos 45), and an orthogonal vector was **correctly
  excluded** by the 0.75 bound. That last one is the abstention mechanism
  working. Probe rows were deleted afterwards (`rag_chunks` is back to 0).
- `fastembed` was run end to end: 384-dim vectors, cosine 0.77 between a
  related question and passage.
- **The accessibility gate was proven able to fail.** `grey` was temporarily
  reverted to #8A8578 and the contrast test failed as intended, naming each
  offending element and its class (`"honest odds. real doors." 3.07:1 (needs
  4.5) — ... text-grey`). A gate that passes but cannot fail is not a gate.

---

## 8. Pending — in priority order

### P1 — the remaining subsystem the brief requires

1. **Payments.** Not started. Clearly labelled sandbox flow behind a provider
   adapter + webhook architecture. Server-authoritative, idempotent,
   signature-verified, never claiming real money moved, no raw card data.

### P2 — completeness and verification

2. **UI surface for `/api/ask`.** The route and the service are done and
   tested; no screen calls them yet. Needs an entry point (opportunity detail
   is the natural place), a citation list, and an explicit abstention state —
   the abstention is the product working and must not render as an error.
3. **Index the corpus.** `rag_chunks` is empty. `POST /reindex` needs
   `SUPABASE_DB_URL` (§11-2). Expect ~5 listings indexed, 22 skipped for no
   text.
4. **Authenticated end-to-end journeys.** Permission boundaries are now
   covered at the database level (`test-rls.sql`) and at the unauthenticated
   HTTP level (`e2e/auth.spec.ts`), but no E2E test signs in and walks a
   student / employer / admin journey. That needs seeded test accounts, which
   should live in a separate Supabase project rather than production.
5. ~~Accessibility audit~~ **DONE** — see §7.10 and `e2e/a11y.spec.ts`.
   Still outstanding: visual QA of the *authenticated* screens, which the
   browser tooling could not reach without a session.
6. **`docs/ARCHITECTURE.md` is stale** and not yet fixed: it describes
   `lib/match/` (actually `lib/matching.ts`), `app/employer/` and `app/admin/`
   (actually under `app/(main)/`), `/api/cron/*` (actually `/api/cron`), says
   push / email delivery is "architecture ready — delivery not enabled" when
   both were later wired, and predates both the Next 16 upgrade and the Python
   service. `docs/DEPLOYMENT.md` also needs the two new services' variables and
   the Python deployment steps.
7. **Migrate the 18 `set-state-in-effect` sites** and restore that rule to
   `error` in `eslint.config.mjs` (§12).

---

## 9. Exact next step

Start P1-1 (payments sandbox) in `D:\shuru-work`. Everything through
`1b7be23` is committed and pushed.

---

## 10. Running local processes / ports

None left running by this session.

| What | Port |
|---|---|
| `npm run dev` | 3000 |
| Playwright (`npm run test:e2e`) | 3100 |
| `uvicorn app.main:app` (services/rag) | 8000 |

---

## 10a. Sign-in: what was wrong and what is true now

`niloybhuiyann@gmail.com` is an **admin** with a profile. It was created via
Google, so `encrypted_password` was null and email+password could never work
against it — the app's own error message said exactly that, but the Google
button had been disabled in production, so there was no way in at all.

A password has now been set on that account via the Supabase admin API, and
the login was **verified end to end**, not just written: a password grant
against `/auth/v1/token` with the public anon key returned `200` and a
1391-character access token.

Two traps worth remembering:

- **Re-registering an existing email looks like it works.** Supabase returns a
  success-shaped response with a decoy user and creates nothing, so nobody can
  probe which addresses exist. The tell is an empty `identities` array. The
  register page now detects it; before the fix it sent people to
  "check your email" forever. Auth-log signature: `/signup 200` immediately
  followed by `/token 400`, with no new row in `auth.users`.
- **`scripts/set-password.mjs` exists** for attaching a password to an
  OAuth-only account. It prompts with echo off, so the value never reaches
  disk, argv, or a commit.

## 11. Human actions still required

Both are Supabase Dashboard settings. There is **no API path to either** — the
Supabase MCP exposes docs/database/debugging/functions/branching only, the
CLI cannot log in from a non-TTY shell, and no management token exists on this
machine. All three were checked, not assumed.

1. **URL configuration** —
   `https://supabase.com/dashboard/project/lciujpypigtbzhjawghf/auth/url-configuration`
   - Site URL → `https://shuru-ten.vercel.app`
   - Redirect URLs → add `https://shuru-ten.vercel.app/auth/callback` **and**
     `http://localhost:3000/auth/callback`

   **Why it matters:** Supabase discards a `redirect_to` that is not
   allowlisted and falls back to Site URL, which is still `localhost:3000`.
   That is why Google sign-in ends on `ERR_CONNECTION_REFUSED`, and it would
   break password-reset links the same way. Email+password login is unaffected
   because it performs no redirect.

   **Verify after:** click "Continue with Google" on production — it should
   return to `shuru-ten.vercel.app/radar`, not localhost.

2. **Leaked-password protection** — Authentication → Policies → enable
   "Prevent use of leaked passwords". The last open security advisor.

   **Caution:** the current password is weak and in the HIBP breach lists. It
   keeps working, but the *next* password change would be rejected. Change it
   to something stronger first.

   **Verify after:** re-run the Supabase security advisors; the
   `auth_leaked_password_protection` WARN disappears.

## 12. Accepted residual risks

- **18 `react-hooks/set-state-in-effect` warnings.** The rule is new in
  `eslint-config-next` 16 and fires on the ordinary load-on-mount /
  reset-on-dependency-change idiom. It is set to `warn` in
  `eslint.config.mjs` with the reasoning written inline — **not disabled**, and
  the gate is still "zero errors". The 9 genuinely-defective findings from the
  same ruleset were fixed rather than downgraded. Restoring this to `error`
  means changing every data-loading screen, which was not worth bundling into
  a framework major.
- **Grounding verification is structural, not semantic.** `verify_grounding`
  rejects an answer that cites nothing or cites a passage that does not exist;
  it does not check that citation `[2]` supports the sentence it is on. Doing
  that needs a second model call per answer. Documented in the service README.
- **Job descriptions are truncated at 4,000 characters** by the ingestion
  pipeline. Four of the five indexable listings hit that ceiling exactly, so
  their tail content is not retrievable.
- **No Content-Security-Policy.** A `unsafe-inline` CSP was deliberately not
  added; a real nonce-based CSP needs middleware work. Still open after the
  Next 16 upgrade.
- **Rate limits are per-instance** (agent 20/day, ingest cooldown, RAG
  30/day) — in-memory cost seatbelts, not security boundaries.
- **`schema_migrations` has RLS on with no policy** — intentional: only
  `service_role`, which bypasses RLS, touches the ledger. It is the single
  documented exemption in `verify-rls.sql`.
- **`unused_index` advisories** — expected on a database whose largest table
  has 27 rows. Not actionable.

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
- **`eslint-config-next` 16 exports FLAT config natively.** Bridging it
  through `FlatCompat` throws
  "TypeError: Converting circular structure to JSON". Import
  `eslint-config-next`, `.../core-web-vitals` and `.../typescript` and spread
  them directly.
- **Next 16 renamed the build's middleware line** from `ƒ Middleware` to
  `ƒ Proxy (Middleware)`, and deprecates the `middleware` file convention in
  favour of `proxy`. `src/middleware.ts` still compiles and is still the
  guard. Confirm independently with
  `node -e "console.log(require('./.next/server/middleware-manifest.json').sortedMiddleware)"`
  — expect `[ '/' ]`.
- **pgvector lives in the `extensions` schema on Supabase**, not `public`.
  Casts must be written `::extensions.vector`. Verified working against the
  live database.
- **`fastembed` needs ~35 s on first use** to download the ONNX model. That is
  a one-time cost per machine, but it will look like a hang in CI.
- **bge embedding models need a query prefix.** `embed()` and `query_embed()`
  are not interchangeable; using `embed()` for questions measurably degrades
  retrieval.
- **RemoteOK keeping 0 listings is correct**, not a broken filter — see
  `docs/decisions/0001-source-filtering.md` before touching `matchesFilters`.
- **Blank match scores on ingested listings are correct** — the engine
  abstains when a listing states too little. See
  `docs/decisions/0002-match-abstention.md`. Do not lower `MIN_COVERAGE`.
- **Vitest uses the `threads` pool deliberately** — `forks` failed
  intermittently on Windows past ~200 tests.
- **Playwright runs against a production build** on port 3100, not `next dev`,
  because dev-server cold compiles caused navigation flakiness.
