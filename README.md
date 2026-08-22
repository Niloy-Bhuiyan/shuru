# Shuru — শুরু

**Find internships. See your honest, evidence-backed chances — or an honest
"not enough data yet." Never a fake number.**

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth,
Storage, RLS) · a committed pixel "cozy retro instrument" design system,
mobile-first with a deliberately designed desktop layout.

---

## 1. Run it

Shuru is database-backed. It does not ship a simulated backend: without a
Supabase project it tells you it is not configured rather than showing
invented data.

```bash
npm install
cp .env.local.example .env.local   # then fill in the Supabase values
npm run dev                        # http://localhost:3000
```

Provisioning Supabase takes about ten minutes and is free —
see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the exact steps and
**"WHAT I NEED TO PROVIDE FOR PRODUCTION"**, the complete list of accounts,
keys and settings with the environment variable each one goes in.

## 2. Database

Migrations live in `supabase/migrations/` and run in filename order. See
[`supabase/README.md`](supabase/README.md).

`supabase/seed.sql` is **optional sample data**. The outcome history it
contains is illustrative, not observed — the UI labels anything computed from
it as sample data. Leave it out of a production database unless you want that
reference set.

## 3. Documentation

| Doc | What's in it |
|---|---|
| [docs/PRD.md](docs/PRD.md) | product definition, roles, requirements, non-goals |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | stack, directory map, authorization model, pipelines |
| [docs/DATABASE.md](docs/DATABASE.md) | tables, RLS, the trigger-based column rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | provisioning, deployment, credentials checklist |
| [supabase/README.md](supabase/README.md) | migration order, promoting an admin |
| [ISSUES.md](ISSUES.md) | prior independent security/quality audit and its remediation |

## 4. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server at :3000 |
| `npm run build` / `npm start` | production build / serve |
| `npm test` | Vitest suite |
| `node scripts/generate-seed.mjs` | regenerates `supabase/seed.sql` and `src/lib/data/seed.ts` from one deterministic source |

## 5. Roles

Three roles live in `public.user_roles`, defaulting to `student`:

- **student** — discover internships, see match information, apply, track, get alerts
- **employer** — company profile, post and manage internships, triage applicants
- **admin** — review employers and listings, handle reports, moderate, read the audit log

There is deliberately no API path to grant yourself a role: `user_roles` has no
self-write policy. Promote the first admin from the Supabase SQL Editor
(see `supabase/README.md`).

## 6. How the honest odds work

- Success = a past outcome of `shortlisted` or `offer`.
- Cohort: same CGPA band (`<3.00`, `3.00–3.49`, `3.50+`) **and** same
  department; if that cohort has fewer than 8 outcomes it relaxes once to
  band-only, and the UI says so.
- Confidence: `HIGH` at n ≥ 20, `MED` at 8 ≤ n < 20.
- **n < 8 → ABSTAIN.** The screen shows what is known and offers a watch
  toggle. No number is ever fabricated.
- "THE ONE THING" = the missing feature with the largest
  shortlisted-vs-rejected rate gap in your cohort, with a 5-point noise floor.
- The engines are pure functions — `src/lib/eligibility.ts`,
  `src/lib/realityCheck.ts` — and are unit-tested.

Listings ingested from external boards carry no outcome history, so Reality
Check abstains on them automatically.

## 7. Resume Forge

A separate "world" inside Shuru: same pixel design family, deeper
slate/molten-amber palette, entered from the amber **RESUME FORGE** tile on
Radar through a short stepped transition.

- **Upload** a PDF or DOCX (max 10 MB), extracted server-side via
  `/api/parse-resume`. With a Gemini key the raw text is structured into the
  resume schema; without one the text still lands in the editor unstructured.
- **Editor** with collapsible sections, reordering, live document preview,
  undo/redo, and a real text-layer PDF export drawn with jsPDF — selectable,
  copyable, ATS-parseable.
- **Readiness rating** and a Pending/Completed/Dismissed queue of ATS checks.
- **JD-Tailor** for keyword match, and an explicit profile sync that is always
  offered, never applied silently.

All scoring is rule-based and free. Gemini is optional everywhere and every AI
entry point hides itself cleanly when no key is set.

## 8. Internship ingestion

Alongside employer-posted internships, Shuru pulls listings from public job
boards through modular adapters. Sources whose terms prohibit it (LinkedIn,
Indeed) are deliberately out of scope.

Every ingested listing is internship-only filtered, normalized, deduplicated
by a deterministic id (so a refresh updates rather than duplicates), freshness
checked, and attributed to its source in the UI.

Honesty rules encoded in the pipeline:

- A source that publishes no real closing date yields a rolling window,
  labelled **Rolling** — never an invented hard deadline.
- Compensation is claimed only with evidence; otherwise the listing reads
  "compensation not stated by source".
- Ingested listings have no outcome history, so Reality Check abstains.

Ingestion runs as a scheduled job and an admin action, protected by
`CRON_SECRET`. Per-source results, including partial failures, are recorded in
`ingestion_runs` rather than silently swallowed.

## 9. Troubleshooting

- **"NOT CONFIGURED" screen** → `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing or still placeholders.
- **Redirect loop to /login** → the session cookie isn't reaching middleware;
  confirm `NEXT_PUBLIC_SITE_URL` matches the origin you're actually browsing.
- **OAuth button does nothing** → the provider is enabled by env flag but not
  configured in Supabase → Authentication → Providers, or its callback URL
  doesn't match `<site>/auth/callback`.
- **"Email not confirmed" on login** → confirm via the emailed link, or turn
  off "Confirm email" in Supabase for development.
- **Fonts look like plain monospace offline** → expected fallback if the first
  `npm run dev` never ran online; harmless.
- **Odds differ between two users** → correct. Cohorts are per CGPA band and
  department; that is the calibration working.

শুরু মানে সূচনা — go open some doors.
