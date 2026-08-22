# Shuru — Deployment

---

## 1. Provision Supabase

1. <https://supabase.com> → **New project** (free tier is enough). Note the
   database password it asks you to set; the app never needs it.
2. **SQL Editor** → run every file in `supabase/migrations/` **in filename
   order**, `0001` through `0006`. Confirm each reports success.
   (If your project already ran the original `schema.sql`, that file is now
   `0001_baseline.sql` — skip it and start at `0002`.)
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

Ingestion and re-verification are HTTP endpoints protected by `CRON_SECRET`.
On Vercel, add a `vercel.json` cron entry or use any external scheduler:

```
POST https://<origin>/api/ingest
Header: x-ingest-secret: <CRON_SECRET>
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
| 6 | Migrations run | `supabase/migrations/0001`–`0006`, in order | Supabase SQL Editor | — |
| 7 | Auth redirect URLs | you configure them | Supabase → Auth → URL Configuration → `<origin>/auth/callback` | — |
| 8 | First admin account | promote after registering | Supabase SQL Editor (`update public.user_roles set role='admin' …`) | — |

## Required for scheduled ingestion

| # | What to provide | Where you get it | Where it goes | Env var |
|---|---|---|---|---|
| 9 | Cron/ingest secret | generate: `openssl rand -hex 32` | Vercel env + your scheduler's request header | `CRON_SECRET` |
| 10 | A scheduler | Vercel Cron, GitHub Actions, or any cron host | calls `POST /api/ingest` with `x-ingest-secret` | — |

## Optional — each feature hides itself when unset

| # | Feature | What to provide | Where you get it | Env var |
|---|---|---|---|---|
| 11 | Google sign-in | OAuth client ID + secret | Google Cloud Console → Credentials | secrets go in **Supabase**; set `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true` |
| 12 | GitHub sign-in | OAuth app client ID + secret | GitHub → Developer settings → OAuth Apps | secrets go in **Supabase**; set `NEXT_PUBLIC_OAUTH_GITHUB_ENABLED=true` |
| 13 | Production email | SMTP host, user, password, sender | Resend / Postmark / SES / any SMTP | Supabase → Settings → Auth → SMTP Settings |
| 14 | AI assistance | Gemini API key | aistudio.google.com/apikey (free) | `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) |
| 15 | Lever listings | public board slugs, comma-separated | the `<slug>` in `jobs.lever.co/<slug>` | `LEVER_COMPANIES` |
| 16 | Ashby listings | public board names, comma-separated | the `<name>` in `jobs.ashbyhq.com/<name>` | `ASHBY_COMPANIES` |
| 17 | Adzuna listings | app id + app key + country | developer.adzuna.com (free tier) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` |
| 18 | Toggle keyless sources | on/off | — | `INGEST_REMOTEOK_ENABLED`, `INGEST_ARBEITNOW_ENABLED` |

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It belongs only in
  server-side environment variables. Any variable prefixed `NEXT_PUBLIC_` is
  shipped to the browser — never put a secret behind that prefix.
- Rotate `CRON_SECRET` if it is ever exposed; it is the only thing standing
  between the public internet and a write-capable ingestion run.
- OAuth client secrets live in Supabase, not in this repo or its environment.
- `.env.local` is git-ignored. Keep it that way.
