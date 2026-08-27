# Shuru — Architecture

**Last updated:** 2026-08-28

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 18, TypeScript (strict) |
| Styling | Tailwind, custom pixel design system in `globals.css` |
| Database | Supabase Postgres (+ pgvector for retrieval) |
| Auth | Supabase Auth (email/password, Google OAuth, GitHub OAuth) |
| Storage | Supabase Storage (CV/resume files) |
| Authorization | Postgres Row Level Security, enforced in the database |
| Retrieval service | Python · FastAPI · LangGraph · LangChain (`services/rag`) |
| Payments | Sandbox provider behind an adapter (`src/lib/payments`) |
| Scheduled work | `/api/cron`, secret-protected, called by Vercel Cron |
| Tests | Vitest, Playwright, pytest |

## 2. Runtime shape

```
Browser
  │
  ├── Client Components ─────────► Supabase (user session, RLS-scoped)
  │
  ├── Route Handlers /api/* ─────► Supabase (session or service-role)
  │        │                        └── external adapters (Lever, Ashby, …)
  │        │
  │        ├── /api/ask ─────────► Python retrieval service (bearer token)
  │        └── /api/payments/* ──► payment provider adapter
  │
  └── src/middleware.ts ─────────► session refresh + role-aware route guard
```

Two deployable units: the Next.js app and the Python retrieval service. Server
Components and Route Handlers are the web API layer; **Postgres RLS is the
authorization boundary** for all data.

Almost the entire UI is client components — there is exactly one server
component (`src/app/layout.tsx`) and one `cookies()` call site
(`src/lib/supabase/server.ts`). Dynamic routes read their parameters with
`useParams()`, which is why the Next 14 → 16 upgrade needed no async-params
migration.

## 3. Directory map

```
src/
  app/
    (auth)/          login, register, onboarding, verify, forgot, reset
    (main)/          student surfaces (radar, opportunity, saved, vault, you,
                     forge, agent, notifications, mentors)
                     employer/  employer workspace + billing/sandbox
                     admin/     admin dashboard
    auth/callback/   OAuth code exchange
    api/
      agent/         LLM chat loop
      ask/           proxy to the Python retrieval service
      cron/          scheduled-job entry point (secret-protected)
      explain/       one-shot LLM explanations
      forge-section/ resume section rewrites
      ingest/        listing ingestion
      notifications/dispatch/   email + push delivery
      parse-resume/  PDF/DOCX extraction
      payments/      checkout · webhook · sandbox-confirm
  components/
    pixel/           design primitives — the visual authority
    forge/           resume builder
  lib/
    auth/            config, session + role helpers, shared-secret compare
    data/            data access, one module per domain
    ingest/          adapter registry, normalization, dedupe, refresh, health
    agent/           provider adapter (Gemini and Claude both implemented)
    payments/        provider contract + sandbox implementation
    rag/             server-only client for the retrieval service
    notify/          notification creation, email providers, web push
    resume/          parsing, ATS scoring, JD match, PDF export
  middleware.ts      MUST live here, not at the repo root — see §10
services/rag/        Python retrieval service (own README)
supabase/
  migrations/        ordered, forward-only SQL migrations (0001–0014)
  verify-rls.sql     database security gate — ten invariants
docs/
```

## 4. Authorization model

Three roles live in `public.user_roles`, defaulting to `student`.

Authorization is enforced in **three layers**, each independently sufficient
for its own scope:

1. **Database (primary).** RLS policies decide row visibility and mutation
   rights. A leaked publishable key still cannot read another student's
   applications.
2. **Middleware.** Refreshes the session and redirects by role before a
   protected page renders — a UX and defence-in-depth layer, not the boundary.
3. **Route handlers.** Re-check the caller's role server-side before any
   privileged mutation, because middleware can be bypassed by direct API calls.

Grants are the coarse gate and policies the fine one; **both** are required.
Migration `0012` aligns them: every DML privilege `authenticated` holds has a
matching policy, `anon` holds nothing at all, and nobody but `service_role` has
TRUNCATE — which is *not* subject to RLS.

Four **guard triggers** enforce rules RLS cannot express, because they concern
which *column* changed rather than which row:

| Trigger | Prevents |
|---|---|
| `guard_opportunity_moderation` | an employer approving their own listing |
| `guard_company_verification` | a company verifying itself |
| `guard_application_transition` | an illegal application status jump |
| `guard_featured_until` | an employer granting themselves paid promotion |

The `service_role` key bypasses RLS and is used only in server-side ingestion,
scheduled jobs, payment fulfilment and admin operations that are already
role-checked. It is never exposed to the browser.

Run `npm run verify:rls` to check all of this against a live database.

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

Adapters self-report availability, so a source without credentials is inactive
rather than failing. An unreachable source degrades a run without failing it:
partial ingestion is recorded in `ingestion_runs` with per-source counts and
errors.

**Honesty rules encoded in the pipeline:**
- A source without a real deadline yields a rolling window, labelled as such —
  never a fabricated hard deadline.
- Compensation is stated only with evidence; otherwise "not stated by source".
- Ingested listings carry no historical outcome data, so Reality Check abstains
  on them automatically.

See ADR 0001 for why RemoteOK contributing **0** listings is the correct
outcome and not a broken filter.

## 6. Matching engine

Pure functions over `(Profile, ResumeContent, Internship) → MatchResult` in
`src/lib/matching.ts`. No network calls, no AI dependency, fully unit-tested.

Each contributing signal carries the evidence that produced it, so the UI can
show *why* — and the engine **abstains** when the resume or the listing carries
too little information to justify a number. See ADR 0002.

## 7. AI: two separate surfaces

They are easy to confuse and do different jobs.

**The agent** (`src/lib/agent`, `/api/agent`) is a tool-using chat loop over
*structured* data. `askAgent` is one stateless model turn; the loop that
executes tools and re-asks lives in the route handler, so providers stay dumb
translators and cost control has one place to live. Two providers implement the
same contract — Claude (`claude.ts`) and Gemini (`gemini.ts`). Anthropic wins
when both keys are set.

**The retrieval service** (`services/rag`, `/api/ask`) answers questions about
the *unstructured* text of listings — the 4,000-character job descriptions the
columns cannot represent — with a citation per claim, and abstains when the
sources do not support an answer. It runs as its own process because it loads
an ONNX embedding model into memory. Its vector store is the same Supabase
Postgres (`public.rag_chunks`, pgvector + HNSW), so there is no second database
to fall out of sync.

Both hide themselves entirely when unconfigured. Neither ever fabricates.

## 8. Payments

Sandbox only. `src/lib/payments/types.ts` defines a hosted-checkout provider
contract; `sandbox.ts` is the one implementation and it moves no money.

The sandbox does **not** shortcut: confirming a payment delivers an HMAC-signed
webhook to `/api/payments/webhook`, the same handler a production provider
would use, so signature verification, the idempotency key and the
server-authoritative state transition are all real code on a real path.

Payment state is server-authoritative — `payments` has no UPDATE policy for
`authenticated`, and `provider_event_id` is UNIQUE so a provider retry cannot
fulfil twice. **No implementation of the provider contract may accept a card
number, CVV or expiry.**

Promoted listings appear in a separate labelled section and are never mixed
into the ranked feed. See ADR 0003 for why that is not negotiable.

## 9. Notifications

Notifications are rows, not pushes. Creation is decoupled from delivery:

```
event (application status change, new listing, deadline approaching)
  → notify.create()      typed row in public.notifications
    → in-app center      always
    → email              via provider adapter, opt-in
    → browser push       via VAPID / Web Push, opt-in
```

Both delivery channels are fully implemented, and both are optional and
opt-in. **`emailed_at` / `pushed_at` are stamped only after the provider
accepted.** A retryable failure leaves them null so the next run picks it up; a
permanent one is reported rather than marked delivered.

Alerts are ranked by match quality × deadline proximity × freshness, and capped
per type per window, so relevance beats volume.

## 10. Things that have broken before

- **`middleware.ts` must live at `src/middleware.ts`.** In a `src/` project
  Next silently never loads it from the repo root, and every protected route
  serves unauthenticated. `npm run build` printing `ƒ Proxy (Middleware)` is
  the only cheap signal — read it. (Next 14 printed `ƒ Middleware`; the rename
  is cosmetic.)
- **RLS policies without table grants** produce `42501 permission denied` on
  every request.
- **Revoking function EXECUTE from `anon` / `authenticated` is not enough** —
  Postgres grants it to `PUBLIC` and both roles inherit. Migration `0009`
  revokes `PUBLIC` explicitly.
- **Supabase default privileges re-grant ALL on each newly created table.** A
  blanket revoke in one migration does not protect a table created by a later
  one — which is exactly how `push_subscriptions` ended up with `anon`
  TRUNCATE. Migration `0012` sets `alter default privileges` so it cannot
  recur.

## 11. Configuration

Every external dependency is environment-gated and self-reporting. A missing
optional key disables its feature *visibly* rather than faking it. Supabase is
the one hard requirement: without it the app renders an explicit configuration
state instead of a simulated backend.

The complete variable list with provisioning steps is in
[DEPLOYMENT.md](DEPLOYMENT.md); the annotated template is `.env.local.example`.
