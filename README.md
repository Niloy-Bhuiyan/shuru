# Shuru — শুরু

**Find internships in Bangladesh. See your honest, calibrated chances of getting
shortlisted — or an honest "not enough data yet." Never a fake number.**

Mobile-first (390px baseline) · Next.js 14 (App Router) + TypeScript + Tailwind +
Supabase · fully committed pixel "cozy retro instrument" design system.

---

## 1. RUN IT RIGHT NOW (offline / demo mode — zero accounts, zero keys)

```bash
cd shuru
npm install                      # needs internet ONCE
cp .env.local.example .env.local # leave the placeholders as they are
npm run dev                      # first run also needs internet once (font caching)
# open http://localhost:3000
```

With placeholder keys the app auto-detects **DEMO MODE**:
- All 30 seeded listings, 614 outcomes, 15 interview reports, 12 mentors are bundled.
- "Registration" is a device profile (localStorage) — no email/password shown.
- Saves/applications/kanban/watch toggles persist in localStorage.
- Everything works with the network cable pulled — except the optional
  "EXPLAIN THIS" AI button, which stays hidden.

> **Why `npm run dev` needs internet the first time:** Next.js downloads the
> Google Fonts (Press Start 2P, Space Mono, Hind Siliguri) on first run and
> caches them in `.next/cache`. After that, offline dev is fine (worst case it
> falls back to system fonts with a console warning — it never crashes).

Useful extra pages:
- `/gallery` — the whole design system on one screen (offline visual reference).

Tests (120 unit + integration tests, incl. seed sanity):

```bash
npm test
```

---

## 2. EVERY PLACEHOLDER YOU MUST FILL LATER

All live in `.env.local` (copy of `.env.local.example`):

| Placeholder | Required? | Where to get it |
|---|---|---|
| `YOUR_SUPABASE_URL_HERE` | For real auth + shared data | Supabase Dashboard → Project Settings → API → **Project URL** |
| `YOUR_SUPABASE_ANON_KEY_HERE` | For real auth + shared data | Same page → **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for listing ingestion in Supabase mode | Same page → **service_role** key. **Server-only secret — never use a `NEXT_PUBLIC_` prefix.** Lets `/api/ingest` write `opportunities` (which is RLS SELECT-only for the anon key). Unset ⇒ the refresh route returns a clear `service_role_key_missing` error instead of silently failing. |
| `YOUR_GEMINI_API_KEY_HERE` | Optional (all AI features) | https://aistudio.google.com/apikey — free, no card. Powers the agent chat, résumé structuring on upload, and EXPLAIN THIS. Unset ⇒ those entry points hide; everything else works. |
| `INGEST_SECRET` | Optional | If set, `POST /api/ingest` requires it (header `x-ingest-secret` or `?secret=`). Unset ⇒ route open, 15-min cooldown still applies. |

Leave any of them as placeholders and the app degrades gracefully:
no Supabase → demo mode; no Gemini → the AI features hide.

---

## 3. SUPABASE SETUP (free tier, ~10 minutes, when you're back online)

1. https://supabase.com → New project (free plan). Pick any region; note the
   database password it asks you to set (you won't need it in the app).
2. Left sidebar → **SQL Editor** → New query → paste the entire contents of
   `supabase/schema.sql` → **Run**. (Creates all 6 tables + RLS policies.)
3. New query again → paste the entire contents of `supabase/seed.sql` → **Run**.
   (Inserts 30 opportunities, 614 outcomes, 15 reports, 12 mentors.)
4. **Authentication → Providers → Email**: for the smoothest first run, turn
   **"Confirm email" OFF**. (If you leave it ON, that's fine too — the app
   parks the onboarding profile and attaches it on first confirmed login.)
5. **Project Settings → API**: copy Project URL + anon key into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

6. Restart `npm run dev`. The app silently switches from demo mode to real
   auth + real tables. Register a fresh account to test.

**Note:** demo-mode data (device profile, saved applications) does not migrate
to Supabase — register fresh once keys are in.

---

## 4. GEMINI KEY (optional — powers every AI feature)

1. https://aistudio.google.com/apikey → Create API key (free tier, no card).
2. In `.env.local`: `GEMINI_API_KEY=AIza...`
3. Restart dev. This one key unlocks three things, each of which hides itself
   cleanly when the key is absent:
   - **Agent chat** (`/agent`) — streams answers and uses the 5 tools;
     server-side only, in `src/app/api/agent/route.ts`.
   - **Résumé structuring** — when you upload a PDF/DOCX in Resume Forge (or
     attach one in the agent), `src/app/api/parse-resume/route.ts` structures
     the text; without a key it falls back to raw-text extraction.
   - **✦ EXPLAIN THIS** — on Reality Check screens that show odds
     (`src/app/api/explain/route.ts`).

   The key is used only server-side and is never sent to the browser.

---

## 5. DEPLOY TO VERCEL (free tier)

1. Push the repo to GitHub (`.env.local` is git-ignored — never commit it).
2. https://vercel.com → Add New → Project → import the repo. Framework preset:
   **Next.js** (auto-detected). No build settings to change.
3. In the import screen (or later: Project → Settings → Environment Variables)
   add your env vars from section 2 for **Production** (and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (only if you want live ingestion; server-only)
   - `GEMINI_API_KEY` (optional — all AI features)
   - `INGEST_SECRET` (optional)
4. Deploy. Done — Supabase free tier + Vercel free tier + Gemini free tier =
   ৳0/month, no credit card anywhere.

(If you deploy WITHOUT the Supabase vars, the deployed site runs in demo mode —
actually a decent public demo.)

---

## 6. SCRIPTS

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at :3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Vitest: eligibility, reality-check, ingestion, agent loop/tools/streaming, vault search, seed sanity (120 tests) |
| `node scripts/generate-seed.mjs` | Regenerates `supabase/seed.sql` **and** `src/lib/data/seed.ts` from one source of truth (deterministic) |

---

## 7. HOW THE HONEST ODDS WORK (so you can defend the numbers)

- Success = past outcome `shortlisted` or `offer`.
- Cohort: same CGPA band (`<3.00`, `3.00–3.49`, `3.50+`) **and** same
  department; if that cohort has fewer than 8 outcomes, it relaxes once to
  band-only (and the UI says so).
- Confidence: `HIGH` at n ≥ 20, `MED` at 8 ≤ n < 20.
- **n < 8 → ABSTAIN.** The terminal screen shows what is known and a watch
  toggle. No number is ever fabricated.
- "THE ONE THING" = the feature you're missing with the largest
  shortlisted-vs-rejected rate gap in your cohort (5-point noise floor).
- Engines are pure functions: `src/lib/eligibility.ts`,
  `src/lib/realityCheck.ts` — both unit-tested.

## 8. DEMO MODE vs SUPABASE MODE

`src/lib/data/index.ts` is the only module screens talk to. It checks whether
real Supabase keys are present:

| | Demo mode | Supabase mode |
|---|---|---|
| Listings / outcomes / reports / mentors | bundled seed (`src/lib/data/seed.ts`) | Postgres tables |
| Profile | localStorage | `profiles` (RLS: owner-only) |
| Applications / kanban | localStorage | `applications` (RLS: owner-only) |
| Auth | device profile | Supabase Auth + `middleware.ts` |

---

## 9. COMPLETE FILE TREE

```
shuru/
├── .env.local.example
├── .gitignore
├── README.md
├── middleware.ts
├── next.config.mjs
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── scripts/
│   └── generate-seed.mjs
├── supabase/
│   ├── schema.sql
│   └── seed.sql
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx                      # entry: → /radar or /login
    │   ├── gallery/page.tsx              # design-system reference screen
    │   ├── api/explain/route.ts          # Gemini (server-side only)
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   └── register/page.tsx         # account + onboarding in one flow
    │   └── (main)/                       # header + nav + profile guard
    │       ├── layout.tsx
    │       ├── radar/page.tsx            # home: sunrise, feed, search, filters
    │       ├── opportunity/[id]/page.tsx # detail + eligibility decoder
    │       ├── opportunity/[id]/reality/page.tsx  # gauge OR abstention
    │       ├── vault/page.tsx            # interview reports
    │       ├── saved/page.tsx            # kanban tracker
    │       ├── mentors/[opportunityId]/page.tsx   # warm intro
    │       └── you/page.tsx              # profile, language, sign out
    ├── components/
    │   ├── pixel/                        # the 8 primitives + icon set
    │   │   ├── PixelBadge.tsx  PixelButton.tsx  PixelCard.tsx
    │   │   ├── PixelCheckTile.tsx  PixelChip.tsx  PixelGauge.tsx
    │   │   ├── PixelIcon.tsx  PixelInput.tsx  PixelNav.tsx
    │   ├── AbstentionTerminal.tsx
    │   ├── DeadlineBadge.tsx
    │   ├── EligibilityChecklist.tsx
    │   ├── EmptyState.tsx
    │   ├── ExplainButton.tsx
    │   ├── LoadingBlock.tsx
    │   ├── OpportunityCard.tsx
    │   ├── PixelSun.tsx
    │   ├── SunriseHeader.tsx
    │   └── SunriseHero.tsx
    ├── hooks/
    │   └── useProfile.ts
    └── lib/
        ├── __tests__/                    # eligibility, realityCheck, seed-sanity
        ├── data/
        │   ├── index.ts                  # unified data layer (demo ⇄ supabase)
        │   └── seed.ts                   # generated offline mirror of seed.sql
        ├── supabase/
        │   ├── client.ts
        │   └── server.ts
        ├── cx.ts
        ├── dates.ts
        ├── eligibility.ts
        ├── i18n.tsx                      # ALL UI strings, EN/বাং
        ├── realityCheck.ts
        └── types.ts
```

---

## RESUME FORGE (v2 — two-pane editor)

A separate "world" inside Shuru: same pixel design family, deeper
slate/molten-amber palette. Entered from the amber **RESUME FORGE** tile on
Radar through a glass-shatter portal transition (irregular shards ripple
outward from your tap point; skipped under prefers-reduced-motion).

**Starting a resume**
- **UPLOAD RESUME**: PDF or DOCX (max 10 MB). Text is extracted server-side
  (`pdf-parse` / `mammoth`) via `/api/parse-resume`. With a Gemini key the
  raw text is structured into the resume schema (review it — AI parsing is
  imperfect by nature). Without a key, the raw text lands in Summary so the
  flow still works end-to-end, just unstructured.
- **START FROM SCRATCH**: pre-filled from your Shuru profile.

**The editor**
- Collapsible accordion sections (Contact, Summary, Education, Experience,
  Projects, Skills), each with a completion dot; reorder with ▲ ▼; a
  section-jump nav opens any section directly.
- Live document preview: a real light serif page (deliberately not
  pixel-styled — it simulates the exported document). Side-by-side with the
  editor on desktop (lg+); an EDITOR/PREVIEW toggle on mobile.
- Click any entry (editor or preview) for the inline toolbar: move up/down,
  edit, eye (jump to preview), delete, and IMPROVE WITH AI (hidden without a
  Gemini key).
- Undo/redo (edits grouped ~700ms, 60 steps) and **Download PDF** — a REAL
  text-layer PDF drawn with jsPDF's text API (loaded on demand): selectable,
  copyable, ATS-parseable text, matching what the app teaches. Serif layout
  mirrors the live preview and paginates automatically.
- **Readiness rating**: segmented block meter (red → amber → teal) with a
  bucket label — NEEDS WORK (<40) / OKAYISH (<70) / STRONG.
- **Suggested actions**: the ATS checks as a Pending / Completed / Deleted
  queue. FIX jumps to the responsible section; the eye expands a Reason;
  dismissed items persist locally and are restorable.
- **JD-Tailor** (keyword match %, missing-keyword chips) and the explicit
  **dashboard sync** (extracted skills / deployed-project evidence / CGPA /
  department offered — never applied silently — to the profile Reality Check
  buckets on) work as before. All scoring is rule-based and free; Gemini is
  optional everywhere.

**Database**: existing projects run `supabase/migration_resume_forge.sql`
once; fresh installs already get the `resumes` table from `schema.sql` —
don't run both. Demo mode needs nothing (localStorage).

## REMOTE LISTING INGESTION

Alongside the curated Bangladesh listings (which show a mint **VERIFIED
LISTING** badge and stay manual), Shuru can pull live internship/junior tech
roles from two free, public APIs — **RemoteOK** (`https://remoteok.com/api`)
and **Arbeitnow** (`https://arbeitnow.com/api/job-board-api`). No keys, no
scraping. LinkedIn/Indeed and any ToS-restricted source are deliberately out
of scope.

**How rows are treated (honest by construction):**
- Filtered to intern-family + tech roles; seniority excluded.
- No real deadline exists in either API, so `deadline = posted + 30 days`
  and the card shows a **REMOTE · via <source>** chip with a "Rolling"
  label — never a fake hard deadline.
- `is_paid` is true only with salary evidence (RemoteOK); otherwise the
  listing is flagged "compensation not stated by source."
- No eligibility gates and zero historical outcomes → Reality Check
  **abstains** on these listings automatically. No invented odds, ever.
- Deterministic IDs mean refreshing **updates** rows instead of duplicating.

**Refreshing (manual, no cron):**
- In the app: **You → Refresh remote listings**.
- Or hit the route directly:
  ```bash
  # open route (no secret set)
  curl -X POST https://your-app.vercel.app/api/ingest

  # if you set INGEST_SECRET
  curl -X POST https://your-app.vercel.app/api/ingest \
    -H "x-ingest-secret: YOUR_SECRET"

  # check status / cooldown without triggering a fetch
  curl https://your-app.vercel.app/api/ingest
  ```
- A 15-minute cooldown per server instance keeps it free-tier friendly; a
  run where both sources are unreachable doesn't burn the cooldown.
- **Demo mode:** ingested rows are returned to the browser and stored in
  localStorage (merged with the seed). **Supabase mode:** rows are upserted
  into the `opportunities` table (`onConflict: id`); curated rows untouched.

## 10. TROUBLESHOOTING

- **Blank page / redirect loop on first run** → you have no profile yet; go to
  `/register`.
- **Fonts look like plain monospace offline** → expected fallback if the first
  `npm run dev` never happened online; harmless.
- **Supabase login says "Email not confirmed"** → confirm via the email, or
  turn off "Confirm email" (section 3.4).
- **Changed the seed script** → run `node scripts/generate-seed.mjs`, re-run
  `supabase/seed.sql` in a fresh database (or truncate the four shared tables
  first), and `npm test` to re-verify the tier distribution.
- **Odds look different between two users** → correct: cohorts are per CGPA
  band + department. That's the calibration working.

শুরু মানে সূচনা — go open some doors.
