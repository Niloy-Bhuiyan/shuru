# ISSUES — Shuru independent audit

Investigation-only audit (no code was modified). Ground truth established during the audit:

- **Production build passes** — `next build` exits 0.
- **All 120 tests pass** — `npm test`, 19 test files.
- `npm audit` was run; dependency findings below come from it.

Findings are ordered most-critical first. 17 total: 3 Critical, 2 High, 5 Medium, 7 Low.

> **Update log (post-audit remediation — 2026-07-10).** Nearly all findings have been
> fixed; see the per-finding **STATUS** lines below. Final verification after ALL changes:
> `next build` exits 0 (lists `ƒ Middleware`), **120/120 tests pass** on the upgraded
> toolchain, and `npm audit` dropped from 9 vulns (2 critical) to **7 (0 critical)**.
> Dependency bumps: `next` 14.2.15→14.2.35, `jspdf` ^2.5.2→^4.2.1, `vitest` 2.1.1→4.1.10,
> `@types/node` 20.16.10→20.19.43, added dev `@vitejs/plugin-react` 6.0.3 (required by the
> Vitest 4 / Vite 8 toolchain to transform JSX in tests).
>
> Two findings were **reassessed as won't-fix** (documented inline, no code change): the
> `outcomes` RLS item (Medium — the snapshot is anonymized and has no user linkage) and the
> `next-env.d.ts` item (Low — gitignoring it is the correct Next.js convention).
>
> Residual `npm audit` items are out of scope: `next` (2 2025 advisories with no 14.2.x
> backport — need a Next 15/16 major; CSP-nonce XSS not exploitable here), plus transitive
> `postcss`/`mammoth`/`@supabase`/`cookie` (moderate/low, clear with those majors).

---

## CRITICAL

### [Severity: Critical] Next.js 14.2.15 carries multiple CVEs, including a Middleware Authorization Bypass
- File: package.json, line 18 (`"next": "14.2.15"`) — impacts middleware.ts
- What's wrong: The pinned Next.js version is affected by a large set of published advisories, most severely an authorization-bypass in Next.js Middleware (GHSA-f82v-jwr5-mffw), plus cache poisoning, DoS via Server Components, SSRF via middleware redirects, and App Router XSS. The app's auth guard lives in `middleware.ts`, so the middleware-bypass advisory is directly relevant to how unauthenticated users are redirected.
- Evidence (log output / reasoning): `npm audit` reports `next` as **critical** (`range: 0.9.9 - 16.3.0-canary.5`) and lists 20+ Next.js advisories including "Authorization Bypass in Next.js Middleware — GHSA-f82v-jwr5-mffw". The auth gate at middleware.ts:53-57 relies on middleware executing correctly for every protected route.
- Suggested fix (one sentence): Upgrade Next.js to the latest patched 14.2.x release (or a newer major) and re-run the build and tests.
- **STATUS: RESOLVED (2026-07-10)** — bumped `next` 14.2.15 → 14.2.35 in package.json; `npm install` updated the lockfile (`next` + `@next/swc-*`, 3 packages). Build exits 0, 120/120 tests pass. Residual: two 2025 advisories with no 14.2.x backport remain in `npm audit` (see update log); closing them requires a Next 15/16 major upgrade, tracked separately.

### [Severity: Critical] jspdf ≤4.2.0 has a critical vulnerability and is used on the resume export path
- File: package.json, line 16 (`"jspdf": "^2.5.2"`)
- What's wrong: The resolved jsPDF version is flagged critical by npm audit; it is loaded on demand to produce the text-layer résumé PDF, so it processes user-controlled résumé content.
- Evidence (log output / reasoning): `npm audit` reports `jspdf` **critical** (`range: <=4.2.0`, fix `jspdf@4.2.1`). Used by src/lib/resume/pdfExport.ts and dynamically imported in src/components/forge/StepFinish.tsx:79-85.
- Suggested fix (one sentence): Upgrade jspdf to 4.2.1+ and re-verify the PDF export layout and pdfExport tests.
- **STATUS: RESOLVED (2026-07-10)** — bumped `jspdf` ^2.5.2 → ^4.2.1. jsPDF's own release notes for 3.0.0 and 4.0.0 declare no breaking changes beyond dropping IE and restricting Node fs access (neither used here); `pdfExport.ts` and the `StepFinish.tsx` dynamic import needed no code changes. The 5 `pdfExport.test.ts` tests all pass; build exits 0; `jspdf` no longer appears in `npm audit`.

### [Severity: Critical] Dev toolchain (vitest / vite / esbuild) has critical/high advisories
- File: package.json, line 31 (`"vitest": "2.1.1"`)
- What's wrong: The test toolchain pulls in vulnerable vitest/vite/esbuild versions. These are dev dependencies (not shipped to users), so real-world exposure is limited to the local/CI dev environment, but the advisories are rated critical/high.
- Evidence (log output / reasoning): `npm audit` reports `vitest` critical (`<=3.2.5`), `vite` high (`<=6.4.2`), `esbuild`/`vite-node`/`@vitest/mocker` moderate; fix is `vitest@4.1.10` (major bump).
- Suggested fix (one sentence): Upgrade vitest to a patched major and confirm all 120 tests still pass.
- **STATUS: RESOLVED (2026-07-10)** — bumped `vitest` 2.1.1 → 4.1.10 (pulls Vite 8 / Rolldown, clearing vite/esbuild/vite-node/@vitest/mocker). Required config changes: added dev `@vitejs/plugin-react` 6.0.3 + `plugins: [react()]` in vitest.config.ts (Vite 8/oxc honors tsconfig `jsx:"preserve"` and couldn't transform JSX a test imports), and bumped `@types/node` 20.16.10 → 20.19.43 (Vite 8 peer). No test files changed. All 120 tests pass; none of vitest/vite/esbuild appear in `npm audit` anymore.

---

## HIGH

### [Severity: High] Client data-loading effects have no error handling → UI hangs on the loading block forever in Supabase mode
- File: src/app/(main)/layout.tsx, line 26 (also radar/page.tsx:48-69, reality/page.tsx:80-95, forge/page.tsx:169-179)
- What's wrong: Each of these effects loads data via a promise (`getProfile()`, `listOpportunities()`, `getResume()`, etc.) with no `.catch`/try-catch. The data-layer functions `throw` on any Supabase error (see src/lib/data/index.ts:102,115,256). When they reject, the corresponding state (`ready`, `items`, `content`, `rc`) is never set, so the screen is stuck on `LoadingBlock` indefinitely, and the rejection is unhandled.
- Evidence (log output / reasoning): The root error boundary (src/app/error.tsx) only catches errors thrown during render, not rejected promises inside `useEffect`. In demo mode these paths can't throw, so the bug is latent until Supabase mode hits any transient network/auth error. `layout.tsx:26` never calls `setReady`, `radar/page.tsx:68` never runs `setItems`, so the guard/feed hang.
- Suggested fix (one sentence): Wrap each async load in try/catch and render an explicit error + retry state instead of an infinite loader.
- **STATUS: RESOLVED (2026-07-10)** — added error handling to all four effects: `layout.tsx` and `forge/page.tsx` `.catch` and fall back (login gate / start step); `reality/page.tsx` wraps the load in try/catch (surfaces the terminal not-found state); `radar/page.tsx` gains a `loadError` state rendering an explicit error + TRY AGAIN retry (reuses `error.*` i18n keys). Build exits 0, 120/120 tests pass.

### [Severity: High] Server-side auth guard (middleware) never executed — wrong file location for a `src/` project
- File: middleware.ts (project root) — should be src/middleware.ts
- What's wrong: The app uses a `src/` directory (`src/app/…`), but `middleware.ts` was placed at the project root. Next.js only loads middleware from `src/middleware.ts` when a `src/` directory is used, so the auth guard never ran. In Supabase mode, protection silently fell back to the client-side guard in src/app/(main)/layout.tsx alone; the intended server-side redirect for unauthenticated users did not happen. (Latent because demo mode no-ops the middleware anyway; only exploitable/observable in Supabase mode. This was missed by the initial audit and found during remediation of Critical #1.)
- Evidence (log output / reasoning): `next build` produced no `ƒ Middleware` line and `.next/server/middleware-manifest.json` had `sortedMiddleware: []`. A dev-server smoke test in forced Supabase mode returned HTTP 200 (not a redirect) for `/radar`, `/you`, and `/opportunity/abc` with no auth cookie.
- Suggested fix (one sentence): Move `middleware.ts` to `src/middleware.ts` (content unchanged; imports are package-absolute).
- **STATUS: RESOLVED (2026-07-10)** — moved to src/middleware.ts (byte-identical content). Re-verified: build now lists `ƒ Middleware 56.4 kB`, manifest `sortedMiddleware: ["/"]`, and unauthenticated `/radar`, `/you`, `/opportunity/abc` now return 307 → /login while `/login` and `/register` return 200. 120/120 tests still pass.

---

## MEDIUM

### [Severity: Medium] Reality-check page effect has no cancellation guard → stale odds can render for the wrong listing
- File: src/app/(main)/opportunity/[id]/reality/page.tsx, line 80-95
- What's wrong: The effect fires an async IIFE that sets `op`, `rc`, `seniors`, `reportCount` with no `cancelled` flag. If the user navigates between opportunities faster than the fetch resolves, a late response can overwrite state for the opportunity now on screen, showing the wrong odds.
- Evidence (log output / reasoning): The radar page deliberately guards against exactly this with `let cancelled = false` + cleanup (radar/page.tsx:50,68,70-72); the reality page omits that pattern, an inconsistency that produces "sometimes the number is wrong after fast navigation" behavior.
- Suggested fix (one sentence): Add a `cancelled` flag set in the effect's cleanup and gate all `set*` calls on it.
- **STATUS: RESOLVED (2026-07-10)** — added a `cancelled` flag with cleanup to the reality-page effect; all `set*` calls are now gated on it (and wrapped in try/catch per the High finding above).

### [Severity: Medium] Résumé edits persist only when the user reaches the FINISH step → mid-flow data loss
- File: src/components/forge/StepFinish.tsx, line 43-54 (with forge/page.tsx state)
- What's wrong: The résumé is auto-saved only on arrival at FINISH. All edits made in the BUILD/SCORE/TAILOR steps live in React state and are lost if the user closes or navigates away before finishing. Additionally, the agent tool `get_ats_analysis` reads the *saved* résumé (src/lib/agent/tools.ts:276-284), so it analyzes stale content during an active edit session.
- Evidence (log output / reasoning): `saveResume` is imported and called only in StepFinish (grep: single call site at StepFinish.tsx:20/46); forge/page.tsx holds edits in `content` state with an in-memory undo history but never persists between steps.
- Suggested fix (one sentence): Debounce-persist the résumé on edit (not only at finish) so work survives reloads and the agent sees current content.
- **STATUS: RESOLVED (2026-07-10)** — added a debounced (800ms) autosave effect in `forge/page.tsx` that calls `saveResume(content)` whenever content changes past the START step, so edits persist as you go. StepFinish's arrival-save (which also gates the profile-sync hints) is retained; `saveResume` is an idempotent single-resume upsert.

### [Severity: Medium] Agent rate-limit map grows without bound (memory leak)
- File: src/lib/agent/loop.ts, line 58 (`const dayCounts = new Map(...)`)
- What's wrong: `dayCounts` accumulates one entry per user key and is never evicted; entries for prior days/users persist for the life of the process. The sibling `rcCache` in the same file is bounded by `CACHE_MAX`, but `dayCounts` has no equivalent cap.
- Evidence (log output / reasoning): `checkRateLimit` (loop.ts:60-70) only overwrites/increments a key's entry; nothing deletes old keys. On a long-lived (non-serverless) instance this is an unbounded growth path.
- Suggested fix (one sentence): Evict stale prior-day entries (or cap the map size) inside `checkRateLimit`.
- **STATUS: RESOLVED (2026-07-10)** — `checkRateLimit` now sweeps prior-day entries once per UTC day and enforces a hard `RATE_KEYS_MAX` (10000) cap against a same-day flood of distinct keys; `_resetAgentState` resets the sweep marker for tests.

### [Severity: Medium] outcomes RLS lets any authenticated user read every applicant's profile_snapshot
- File: supabase/schema.sql, line 115-116 (`outcomes_read` policy)
- What's wrong: The `outcomes` table's read policy allows any authenticated user to `select *`, which includes the `profile_snapshot` jsonb column (CGPA, department, skills, etc. of other applicants). The odds engine only needs aggregates, not row-level access to everyone's snapshots.
- Evidence (log output / reasoning): schema.sql:52-58 defines `profile_snapshot jsonb not null`; schema.sql:115-116 grants read to all `auth.role() = 'authenticated'`. Depending on what the snapshot contains, this is a potential PII exposure.
- Suggested fix (one sentence): Serve reality-check inputs through a column-restricted view or RPC that returns only the fields the engine needs, and tighten the raw-table policy.
- **STATUS: REASSESSED — WON'T FIX (2026-07-10)** — on inspection `profile_snapshot` contains only `{cgpa, dept, year, has_projects, has_deployed_project}` (types.ts:57-64) — anonymized cohort attributes with NO name/email — and the `outcomes` table has **no `user_id`** (schema.sql:52-58), so rows cannot be linked to any individual. It is aggregate, unlinkable data the client-side odds engine legitimately needs (`realityCheck` reads every one of those fields), and no column is droppable. Restricting it would break Reality Check for no real privacy gain, so the current authenticated-read policy is left as-is by design.

### [Severity: Medium] Gemini default model differs between code and documentation
- File: src/lib/agent/gemini.ts, line 18 (`... || "gemini-2.5-flash"`)
- What's wrong: The code defaults `GEMINI_MODEL` to `gemini-2.5-flash`, but `.env.local.example:22` documents the default as `gemini-2.0-flash`. An operator debugging a "model not found" error will be misled about which model is actually being called.
- Evidence (log output / reasoning): gemini.ts:18 vs .env.local.example:22 ("Optional: override the Gemini model (default: gemini-2.0-flash)").
- Suggested fix (one sentence): Make the documented default and the code default identical.
- **STATUS: RESOLVED (2026-07-10)** — updated `.env.local.example` to state the actual default (`gemini-2.5-flash`) and list `gemini-2.0-flash` as an override example; code default unchanged (no runtime behavior change).

---

## LOW

### [Severity: Low] Demo sign-out leaves applications, résumé, and ingested rows behind
- File: src/app/(main)/you/page.tsx, line 115-122 (`onSignOut`)
- What's wrong: In demo mode, sign-out removes only `shuru.demo.profile`; `shuru.demo.applications`, `shuru.demo.resume`, and `shuru.demo.ingested` persist and bleed into the next device profile created on the same browser.
- Evidence (log output / reasoning): you/page.tsx:117 removes a single key; the reset button (onResetDemo, :124-129) clears all `shuru.*` keys, showing the intended full-clear pattern exists but isn't used on sign-out.
- Suggested fix (one sentence): On demo sign-out, remove all `shuru.*` localStorage keys, not just the profile.
- **STATUS: RESOLVED (2026-07-10)** — `onSignOut` now removes all `shuru.demo.*` keys (profile, applications, resume, ingested) instead of only the profile.

### [Severity: Low] No timeout/abort on Gemini network calls
- File: src/lib/agent/gemini.ts, line 139 and 182 (askGemini / askGeminiStream)
- What's wrong: The provider fetch calls have no AbortController/timeout, so a hung upstream connection blocks the request until the hosting platform's timeout fires. The ingest path already models the right pattern with an 8s AbortController.
- Evidence (log output / reasoning): gemini.ts:139/182 call `fetch(...)` with no `signal`; contrast src/lib/ingest/refresh.ts:59-77 which aborts after `FETCH_TIMEOUT_MS`.
- Suggested fix (one sentence): Add an AbortController with a bounded timeout to both Gemini fetches.
- **STATUS: RESOLVED (2026-07-10)** — both `askGemini` and `askGeminiStream` now use an AbortController with a 30s `REQUEST_TIMEOUT_MS`. For the stream the timer bounds time-to-first-byte (connect/headers) and is cleared once the response arrives, so a legitimately long token stream is never cut off mid-answer.

### [Severity: Low] Rate limit and ingest cooldown are in-memory per instance
- File: src/lib/agent/loop.ts, line 58 (and src/lib/ingest/refresh.ts, line 40)
- What's wrong: The 20-messages/day agent cap and the 15-minute ingest cooldown are stored in module memory. On multi-instance serverless deployments each instance keeps its own counter, so effective limits scale with instance count rather than being global.
- Evidence (log output / reasoning): loop.ts:15-16 comments and refresh.ts:39 comments explicitly acknowledge "serverless cold start resets it — fine"; correct as a cost seatbelt but not a hard limit.
- Suggested fix (one sentence): Note this as a scaling caveat, or back the counters with a shared store (e.g. a Supabase table) if hard limits are required.
- **STATUS: ACKNOWLEDGED — no code change (2026-07-10)** — this is the documented, intentional design (an in-memory cost seatbelt, not a security boundary). Left as-is; would only need a shared store if hard global limits become a requirement. (The unbounded-growth aspect of `dayCounts` was separately fixed under the Medium finding above.)

### [Severity: Low] README test-count is internally inconsistent
- File: README.md, line 36 (also line 131)
- What's wrong: The README says "98 unit + integration tests" in one place and "120 tests" in another; the actual suite is 120.
- Evidence (log output / reasoning): `npm test` reports "Tests 120 passed (120)"; README.md:36 says 98, README.md:131 says 120.
- Suggested fix (one sentence): Reconcile both references to 120.
- **STATUS: RESOLVED (2026-07-10)** — README.md:36 changed "98" → "120"; both references now read 120.

### [Severity: Low] parse-resume MIME routing can misclassify a mislabeled file
- File: src/app/api/parse-resume/route.ts, line 130-139
- What's wrong: `isDocx` is true if the name ends in `.docx` or the browser-supplied `file.type` matches, even when the magic-byte ZIP check disagrees; a mislabeled non-zip `.docx` is routed to mammoth and throws. It is caught and returned as 422, so the impact is a confusing error rather than a crash.
- Evidence (log output / reasoning): route.ts:134-139 ORs magic bytes with `name.endsWith`/`file.type`; the catch at :152-154 returns `extract_failed`.
- Suggested fix (one sentence): Prefer magic-byte detection over the client-supplied name/type when they conflict.
- **STATUS: RESOLVED (2026-07-10)** — detection now treats magic bytes (%PDF- / PK zip header) as authoritative and only falls back to name/`file.type` when both are inconclusive, so a mislabeled file routes to the correct parser.

### [Severity: Low] Duplicated demo-mode and provider-key detection logic
- File: middleware.ts, line 14-18 (and src/lib/agent/adapter.ts, line 86-97)
- What's wrong: `middleware.ts` reimplements the exact `isDemoMode` check that already lives in src/lib/demoMode.ts, and adapter.ts repeats the "key present and not a placeholder" pattern. Duplication risks the checks drifting apart over time.
- Evidence (log output / reasoning): middleware.ts:14-18 vs demoMode.ts:7-16 are byte-for-byte equivalent logic; adapter.ts:86-90 mirrors the placeholder-detection idiom.
- Suggested fix (one sentence): Extract one shared helper for each check and import it in both places.
- **STATUS: RESOLVED (2026-07-10)** — `src/middleware.ts` now imports `isDemoMode` from `@/lib/demoMode` (the shared source of truth) instead of an inline copy. (The adapter's provider-key placeholder pattern is internal to one file — `geminiKey` plus a commented-out `anthropicKey` scaffold — so it was left as-is; there is no active cross-file duplication there.)

### [Severity: Low] next-env.d.ts is committed but also listed in .gitignore
- File: .gitignore, line 8
- What's wrong: `next-env.d.ts` appears in `.gitignore` yet exists as a tracked file in the repo, a tracked-yet-ignored inconsistency that can confuse contributors.
- Evidence (log output / reasoning): .gitignore:8 lists `next-env.d.ts`; the file is present in the project root.
- Suggested fix (one sentence): Decide whether to track or ignore it and make the two consistent.
- **STATUS: REASSESSED — no code change (2026-07-10)** — gitignoring `next-env.d.ts` is the correct, Next.js-recommended convention (the file is auto-regenerated on build and should not be committed), so `.gitignore` is left as-is. This workspace is not a git repo, so nothing is actually "tracked"; if the upstream repo committed it by mistake, untrack it with `git rm --cached next-env.d.ts` (no source change needed).
