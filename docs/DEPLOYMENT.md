# Shuru — Deployment

---

## 1. Provision Supabase

1. <https://supabase.com> → **New project** (free tier is enough). Note the
   database password it asks you to set; the app never needs it.
2. Apply the migrations. Either run `npm run migrate` (needs `SUPABASE_DB_URL`
   in `.env.local`; tracks what has run in `public.schema_migrations`), or
   paste each file in `supabase/migrations/` into the **SQL Editor** in
   filename order, `0001` through `0009`.
   (If your project already ran the original `schema.sql`, that file is now
   `0001_baseline.sql` — skip it and start at `0002`.)
   `npm run migrate:status` lists what is applied and what is pending.
3. Optionally run `supabase/seed.sql` for the reference listing set. Its
   outcome history is illustrative, not observed — leave it out of production
   unless you want that sample data.
4. **Project Settings → API** — copy the Project URL, the `anon` key and the
   `service_role` key into your environment (section 4).

## 2. Authentication

**Authentication → URL Configuration**

- Site URL: your deployment origin, e.g. `https://shuru.vercel.app`
- Redirect URLs: add `<origin>/auth/callback` for every origin you use,
  including `http://localhost:3000/auth/callback` for local development.

**Authentication → Providers → Email** — enable it. Keep "Confirm email" on
for production; the app has a full verification flow (`/verify-email`). For
local development you may turn it off for speed.

**Google OAuth** (optional)

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID**
   (type: Web application).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   — this is Supabase's callback, not your app's.
3. Paste the client ID and secret into Supabase → Authentication → Providers →
   Google, and enable it.
4. Set `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true` so Shuru renders the button.

**GitHub OAuth** (optional)

1. GitHub → Settings → Developer settings → **New OAuth App**.
2. Authorization callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. Paste the client ID and secret into Supabase → Authentication → Providers →
   GitHub, and enable it.
4. Set `NEXT_PUBLIC_OAUTH_GITHUB_ENABLED=true`.

The provider secrets live in Supabase, never in Shuru's environment. The
`NEXT_PUBLIC_OAUTH_*` flags only control whether the button is drawn, so the
UI never offers a provider that would fail on click.

## 3. Email

Supabase's built-in SMTP is rate-limited and intended for development. For
production, set your own sender under **Project Settings → Auth → SMTP
Settings** (Resend, Postmark, SES, or any SMTP provider). Verification and
password-reset emails both depend on it.

## 4. Deploy

1. Push to GitHub. `.env.local` is git-ignored — never commit it.
2. <https://vercel.com> → Add New → Project → import the repo. Framework
   preset **Next.js** is detected automatically; no build settings to change.
3. Add the environment variables from section 5 for **Production** and
   **Preview**.
4. Deploy, then set `NEXT_PUBLIC_SITE_URL` to the real deployment origin and
   add `<origin>/auth/callback` to Supabase's redirect URLs.

## 5. Scheduled jobs

Ingestion and re-verification are HTTP endpoints protected by `INGEST_SECRET`.
On Vercel, add a `vercel.json` cron entry or use any external scheduler:

```
POST https://<origin>/api/ingest
Header: x-ingest-secret: <INGEST_SECRET>
```

Runs are recorded in `ingestion_runs`, including per-source partial failures.

---

# WHAT I NEED TO PROVIDE FOR PRODUCTION

Everything below is something only you can supply. Nothing here can be
generated from the codebase.

## Required — the app does not run without these

| # | What to provide | Where you get it | Where it goes | Env var |
|---|---|---|---|---|
| 1 | Supabase project | supabase.com → New project | — | — |
| 2 | Project URL | Supabase → Settings → API → Project URL | Vercel env + `.env.local` | `NEXT_PUBLIC_SUPABASE_URL` |
| 3 | Anon public key | Supabase → Settings → API → `anon public` | Vercel env + `.env.local` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| 4 | Service role key | Supabase → Settings → API → `service_role` | Vercel env **only** (server-side secret, never `NEXT_PUBLIC_`) | `SUPABASE_SERVICE_ROLE_KEY` |
| 5 | Deployment origin | your Vercel URL or custom domain | Vercel env + `.env.local` | `NEXT_PUBLIC_SITE_URL` |
| 6 | Migrations run | `supabase/migrations/0001`–`0009`, in order | `npm run migrate`, or Supabase SQL Editor | — |
| 7 | Auth redirect URLs | you configure them | Supabase → Auth → URL Configuration → `<origin>/auth/callback` | — |
| 8 | First admin account | promote after registering | Supabase SQL Editor (`update public.user_roles set role='admin' …`) | — |

## Required for scheduled ingestion

| # | What to provide | Where you get it | Where it goes | Env var |
|---|---|---|---|---|
| 9 | Cron/ingest secret | generate: `openssl rand -hex 32` | Vercel env + your scheduler's request header | `INGEST_SECRET` |
| 10 | A scheduler | Vercel Cron, GitHub Actions, or any cron host | calls `POST /api/ingest` with `x-ingest-secret` | — |
| 11 | Vercel Cron secret | generate: `openssl rand -hex 32` | Vercel env only | `CRON_SECRET` |

### Scheduling on Vercel

`vercel.json` already declares both cron jobs — ingestion every 6 hours and
notification dispatch every 15 minutes. **Set `CRON_SECRET` or they refuse to
run**: `/api/cron` returns 503 when it is unset rather than executing an
unauthenticated job, because a public URL that triggers ingestion is a
denial-of-wallet vector.

Vercel Cron can only issue a GET and cannot attach custom headers — it sends
`Authorization: Bearer $CRON_SECRET`. The job endpoints are POST with
`x-ingest-secret`, so `/api/cron?job=…` authenticates the scheduler and then
performs the real POST. Any scheduler that can POST with a header should skip
`/api/cron` and call `/api/ingest` and `/api/notifications/dispatch` directly.

## 6. Notification delivery

Notifications are always written as database rows and always appear in-app.
Email and browser push are optional channels layered on top; with neither
configured the product works, and `emailed_at` / `pushed_at` stay null so
nothing claims a delivery that did not happen.

| # | Feature | What to provide | Where you get it | Env var |
|---|---|---|---|---|
| 12 | Email delivery | provider choice + API key + verified sender | resend.com or postmarkapp.com (both have free tiers) | `EMAIL_PROVIDER`, `EMAIL_FROM`, and `RESEND_API_KEY` **or** `POSTMARK_SERVER_TOKEN` |
| 13 | Browser push | a VAPID keypair — **self-generated, no account needed** | `node scripts/generate-vapid-keys.mjs` | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

**Email.** `EMAIL_FROM` must be a sender on a domain verified with your
provider, or every send is rejected. Check configuration without sending:

```
GET /api/notifications/dispatch
```

It reports each channel as configured or names the missing variable.

**Push.** Generate the keypair once and keep it stable — rotating it
invalidates every existing subscription and silently stops delivery. The
public key ships to browsers; the private key is server-only and must never
carry a `NEXT_PUBLIC_` prefix.

Push requires HTTPS (localhost is exempt), so it will not work over a plain
HTTP preview. On iPhone and iPad, Web Push only works after the user adds
Shuru to their Home Screen — the UI states this rather than showing a toggle
that does nothing.

Both channels are opt-in per user: `notification_preferences.email` and
`browser_push` default to **false**, so a user who never opens their settings
is never emailed or pushed.

## Optional — each feature hides itself when unset

| # | Feature | What to provide | Where you get it | Env var |
|---|---|---|---|---|
| 11 | Google sign-in | OAuth client ID + secret | Google Cloud Console → Credentials | secrets go in **Supabase**; set `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true` |
| 12 | GitHub sign-in | OAuth app client ID + secret | GitHub → Developer settings → OAuth Apps | secrets go in **Supabase**; set `NEXT_PUBLIC_OAUTH_GITHUB_ENABLED=true` |
| 13 | Production email | SMTP host, user, password, sender | Resend / Postmark / SES / any SMTP | Supabase → Settings → Auth → SMTP Settings |
| 14 | AI assistance | Gemini API key | aistudio.google.com/apikey (free) | `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) |
| 15 | Lever listings | public board slugs, comma-separated | the `<slug>` in `jobs.lever.co/<slug>` | `LEVER_COMPANIES` |
| 16 | Ashby listings | public board names, comma-separated | the `<name>` in `jobs.ashbyhq.com/<name>` | `ASHBY_COMPANIES` |

**Board slugs worth knowing.** Not every well-known company has a public board,
and a wrong slug returns 404 rather than an error you would notice. These were
verified live (`scripts/probe-boards.mjs` re-checks them):

- Lever — `palantir` resolves and carries intern postings **with full
  descriptions**. `netflix`, `brex`, `ramp`, `figma`, `shopify` return 404;
  `spotify` and `plaid` resolve but list no interns.
- Ashby — `openai`, `notion`, `ramp`, `vanta`, `replit` all resolve and carry
  intern postings. `deel` returns nothing; `linear` and `posthog` list no interns.

Lever and Ashby matter beyond volume: they publish **structured descriptions**,
which is the listing evidence the match engine needs. Keyless boards
(RemoteOK, Arbeitnow) publish none, which is why match scores stay blank on
their listings — see `docs/decisions/0002-match-abstention.md`.
| 17 | Adzuna listings | app id + app key + country | developer.adzuna.com (free tier) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` |
| 18 | Toggle keyless sources | on/off | — | `INGEST_REMOTEOK_ENABLED`, `INGEST_ARBEITNOW_ENABLED` |

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It belongs only in
  server-side environment variables. Any variable prefixed `NEXT_PUBLIC_` is
  shipped to the browser — never put a secret behind that prefix.
- Rotate `INGEST_SECRET` if it is ever exposed; it is the only thing standing
  between the public internet and a write-capable ingestion run.
- OAuth client secrets live in Supabase, not in this repo or its environment.
- `.env.local` is git-ignored. Keep it that way.
