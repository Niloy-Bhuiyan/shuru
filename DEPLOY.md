# Shuru — Production Deploy Runbook

Tailored to your infra:
- **Vercel:** https://vercel.com/niloybhuiyann-5710s-projects
- **Supabase org:** https://supabase.com/dashboard/org/rqosbbabpbtukuqclamw

Current production readiness (verified locally): `next build` exits 0, **120/120 tests pass**,
`npm audit` = 0 critical (only the deferred Next 15/16 items remain). AI features validated
against the live Gemini API (see §3).

---

## 1. Create the Supabase project (you — I can't access your dashboard)

1. In your org, **New project** (free tier). Set a DB password (you won't need it in the app).
2. Left sidebar → **SQL Editor** → New query → paste ALL of **`supabase/schema.sql`** → **Run**
   (creates all tables + RLS policies + the `resumes` table).
3. New query → paste ALL of **`supabase/seed.sql`** → **Run** (30 opportunities, 614 outcomes,
   15 reports, 12 mentors). Do NOT also run `migration_resume_forge.sql` — schema.sql already
   includes it.
4. **Authentication → Providers → Email** → turn **"Confirm email" OFF** for the smoothest
   first run (optional; if left on, the app parks the onboarding profile until first login).
5. **Project Settings → API** → copy three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (SECRET — never `NEXT_PUBLIC_`)

## 2. Environment variables

Local dev lives in `.env.local` (already created, git-ignored). Fill the three Supabase
values to leave demo mode. The Gemini key is already wired.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role key | **secret**; only for `/api/ingest` |
| `GEMINI_API_KEY` | (set) | **secret**; server-only |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | fast, non-thinking (see §3) |
| `INGEST_SECRET` | optional | if set, `POST /api/ingest` requires it |

## 3. Gemini / AI features — validated, with one caveat

- The provided key authenticates and **works** (live-tested). The app default model was
  updated from the now-retired `gemini-2.5-flash` (404 "no longer available to new users")
  to **`gemini-flash-lite-latest`** — fast (~1.5s) and it never goes stale.
- **Verified working:** "Explain This" (`/api/explain`) and the **agent** (`/api/agent`,
  tool-calling) — both return correct answers in ~1.5–2.5s.
- **Streaming caveat:** the agent's token-by-token SSE stream is flaky with current Gemini
  flash-lite (Gemini 3.x streaming + function-calling + thought-signatures). The client
  **automatically falls back to the reliable buffered path**, so users still get correct
  answers — just not the token animation for tool-using replies. Non-AI everything is
  unaffected. If you want guaranteed streaming later, it needs a model/endpoint revisit.
- **Rotate the key:** it was shared in chat — regenerate at https://aistudio.google.com/apikey
  and update `GEMINI_API_KEY` locally + in Vercel.

## 4. Deploy on Vercel (you)

1. https://vercel.com → your project scope → **Add New → Project** → import this repo.
   Framework preset **Next.js** is auto-detected; no build settings to change.
2. **Settings → Environment Variables** → add, for **Production** (and Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-flash-lite-latest`, (optional `INGEST_SECRET`).
3. **Deploy.** (Deploying without the Supabase vars runs a public demo in demo mode.)
4. Post-deploy smoke test: register a fresh account → Radar loads listings → open a listing →
   Reality Check shows a gauge or an honest abstention → try "Explain This" and the agent.

## 5. Known residuals (deferred, non-blocking)

- **Next.js 15/16 major** — clears the last 2 advisories (`next` high, `postcss` moderate in
  `npm audit`). One (CSP-nonce XSS) isn't exploitable here; the other (RSC cache-poisoning)
  is largely mitigated on Vercel. The major has breaking changes (async `cookies()` in
  `src/lib/supabase/server.ts`), so it's a separate focused effort — safe to launch on 14.2.35.
- **Agent streaming** — see §3.

## 6. What I still need from you to finish/verify real-Supabase mode locally
- Supabase **project** URL + `anon` key + `service_role` key (the org URL alone isn't enough).
  Paste them and I'll wire `.env.local`, run in Supabase mode, and verify register → radar →
  reality → middleware auth end-to-end before you deploy.
