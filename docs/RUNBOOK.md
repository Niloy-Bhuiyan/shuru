# Shuru — Operations Runbook

What to check before a release, and what to do when something looks wrong.
Deployment *setup* lives in `DEPLOYMENT.md`; this is the day-two document.

---

## 1. Pre-release gate

All five must pass. None of them require a database.

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm test             # vitest, unit + integration
npm run test:e2e     # playwright, mobile 390px + desktop 1440px
npm run build        # must print "ƒ Middleware"
```

The database has its own gate, which does need a connection — see §2:

```bash
npm run verify:rls
```

`test:e2e` builds and serves a **production** bundle on port 3100 rather than
running `next dev`, so it exercises middleware and the security headers as
shipped. It also removes a class of flakiness: `next dev` compiles routes on
first request, and parallel workers hitting a cold server intermittently
failed navigation assertions that pass in isolation.

**`ƒ Middleware` must appear in the build output.** Its absence means the auth
guard did not compile into the deployment and every protected route is served
unauthenticated. This has regressed once before, when `middleware.ts` sat at
the repo root instead of `src/` (see `ISSUES.md`); the build line is the only
cheap signal, so read it.

## 2. Database verification

```bash
npm run verify:rls
```

Ten invariants, all of which must pass. The SQL lives in
`supabase/verify-rls.sql` and can also be pasted straight into the Supabase
SQL Editor if you do not have `SUPABASE_DB_URL` set locally.

| # | Invariant | Why it exists |
|---|---|---|
| 1 | RLS enabled on every table | RLS *is* the authorization boundary |
| 2 | Every RLS-enabled table has a policy | `schema_migrations` is the one documented exemption |
| 3 | Every `authenticated` grant has a matching policy | grants are the coarse gate, policies the fine one — they must agree |
| 4 | `anon` has no table privileges | the publishable key is public by design |
| 5 | No TRUNCATE / REFERENCES / TRIGGER for `anon` or `authenticated` | **TRUNCATE is not subject to RLS** |
| 6 | `anon` can execute no functions | see the `PUBLIC` note below |
| 7 | Only the five policy helpers are SECURITY DEFINER *and* callable by `authenticated` | a guard trigger reachable over `/rest/v1/rpc` would be a hole |
| 8 | Every function pins `search_path` | stops a caller shadowing an object a definer function resolves |
| 9 | No self-write path to `user_roles` | this is what prevents self-promotion to admin |
| 10 | Policies hoist `auth.*()` into an InitPlan | otherwise re-evaluated once per candidate row |

These are written as invariants rather than expected counts on purpose. This
section used to carry a hand-maintained tally ("service_role 16/16,
authenticated select 16 / insert 13 …"). Counts drift the moment a table is
added, and the natural fix is to edit the expected number — which is how a
security gate quietly stops being one. Check 3 replaces that tally with a rule
that stays true as the schema grows.

Two things worth knowing before you debug a failure:

**Grants and policies are both required.** RLS policies without table grants
produce `42501 permission denied` on every request. Policies decide *which
rows*; grants decide whether the role may touch the table at all. Migration
`0007` supplies the grants.

**Revoking `EXECUTE` from `anon` / `authenticated` is not enough.** PostgreSQL
grants `EXECUTE` to `PUBLIC` by default and both roles inherit through it.
Migration `0009` revokes `PUBLIC` explicitly; that is the whole reason it
exists.

Also run Supabase's own linter (Dashboard → Advisors, or the MCP
`get_advisors`) after any schema change. It caught the issues `0008`, `0009`
and `0011` fix.

## 3. Promoting the first admin

There is no self-service path to `admin`, by design. In the SQL Editor:

```sql
update public.user_roles set role = 'admin'
where user_id = (select id from auth.users where email = 'you@example.com');
```

Employers are promoted the same way with `role = 'employer'`. An employer then
creates their company from `/employer`, and an admin verifies it before its
listings can go live.

## 4. Ingestion

Trigger a run:

```
POST /api/ingest    header: x-ingest-secret: <INGEST_SECRET>
```

Check status and per-source health (secret required — it lists every board
this deployment pulls from):

```
GET /api/ingest    header: x-ingest-secret: <INGEST_SECRET>
```

`GET` returns a `health` array with one verdict per source. Admins see the same
data in the UI at **/admin → Sources**.

| status | meaning | action |
| --- | --- | --- |
| `healthy` | fetching and keeping listings | none |
| `yielding_nothing` | reachable, kept nothing | **usually none** — see below |
| `degraded` | some recent runs failed | check the board's API |
| `failing` | latest run failed | check network / board availability |
| `never_run` | configured but never executed | check the scheduler |

**`yielding_nothing` is not an error.** RemoteOK routinely fetches ~100
listings and keeps 0 because it carries no tech internships, and that is the
correct outcome, not a broken filter — see `docs/decisions/0001-source-filtering.md`
before changing anything. Investigate only if a source that *was* healthy
turns quiet, which suggests its payload shape changed.

Do not tune `matchesFilters` against one source's number. Re-run
`scripts/probe-source-filters.mjs` against both live feeds first.

## 5. Match scores read as blank

Expected on ingested listings. The engine abstains (`score: null`) when a
listing states too little to judge — most job boards publish no structured
skills, and scoring "remote and in Dhaka" as a strong match would be a number
with nothing behind it. See `docs/decisions/0002-match-abstention.md`.

Matching activates as listings gain real skill data:

- **employer-posted listings** state skills at creation (`/employer/listings/new`);
- **Lever / Ashby** boards carry full descriptions — set `LEVER_COMPANIES` /
  `ASHBY_COMPANIES` to public board slugs.

Do not lower `MIN_COVERAGE` to make numbers appear. The regression test in
`src/lib/__tests__/matching.test.ts` pins the real ingested shape.

## 5a. Notification delivery

Check configuration without sending anything (the same secret POST uses —
these status endpoints name your provider and job boards, so they are not
public):

```
GET /api/notifications/dispatch    header: x-ingest-secret: <INGEST_SECRET>
```

It reports `email` and `push` each as configured or names the exact missing
variable. Run a dispatch:

```
POST /api/notifications/dispatch   header: x-ingest-secret: <INGEST_SECRET>
```

The response separates `sent`, `failed` and `skipped`, with `skip_reasons`
counted by cause. Common `skip_reasons` and what they mean:

| reason | meaning |
| --- | --- |
| `email_disabled` | user has not opted in — **the default**, not a fault |
| `daily_cap_reached` | `max_alerts_per_day` hit; highest-priority alerts were sent first |
| `expired` | alert outlived its listing and was dropped rather than sent late |
| `no_email_address` | auth record has no address |
| `already_emailed` | `emailed_at` already stamped |

**`emailed_at` / `pushed_at` are stamped only after the provider accepted.** A
retryable failure leaves them null so the next run picks it up; a permanent
one is reported in `failures` rather than marked delivered. If you see
`sent but not stamped`, that message may duplicate on the next run — it is
reported precisely so the duplicate is not a mystery.

Dead push subscriptions are retired automatically: a 404/410 from the push
service sets `expired_at`, so a stale device stops consuming send attempts.
Rotating the VAPID keypair invalidates every subscription at once — if push
goes universally quiet, check that first.

## 6. Common symptoms

| Symptom | Likely cause |
| --- | --- |
| Every request 403s with `42501` | grants missing — apply `0007` (§2) |
| Protected routes serve without auth | `ƒ Middleware` missing from build (§1) |
| Employer/admin action "succeeds" but nothing changes | caller is not that role; the guard trigger reverted it. `moderateListing`/`verifyCompany` re-read and raise `ModerationRejected` rather than reporting a false success |
| Alerts never arrive | check `GET /api/notifications/dispatch` — the channel is probably unconfigured, or the user never opted in (both default to false) |
| Cron jobs return 503 | `CRON_SECRET` is unset; `/api/cron` refuses rather than running an unauthenticated job |
| Push works on desktop, not iPhone | iOS requires the site be added to the Home Screen before Web Push is available |
| Ingestion returns 429 | 15-minute in-memory cooldown, per instance |
| Ingestion returns 401 | `INGEST_SECRET` mismatch |

## 7. Known limitations

Deliberate, documented, not defects:

- **Rate limits are per-instance.** The agent's 20/day cap and the ingest
  cooldown live in module memory, so on multi-instance serverless they scale
  with instance count. They are cost seatbelts, not security boundaries.
- **Email and push are optional and opt-in.** Both are fully implemented, but
  a deployment without provider credentials sends nothing and leaves
  `emailed_at` / `pushed_at` null rather than overstating delivery. Both user
  preferences default to false.
- **No Content-Security-Policy is set.** Next's App Router injects inline
  bootstrap scripts, so a useful CSP needs per-request nonces via middleware.
  A `unsafe-inline` policy was deliberately not added: it would imply XSS
  protection it does not provide. The other security headers are set
  (`next.config.mjs`).
- **The service worker caches nothing.** It exists only to receive push
  events. An offline cache for live listing data would serve stale deadlines
  and stale odds, which is worse than an offline error.
- **`schema_migrations` has RLS on with no policy.** Intentional: only
  `service_role` (which bypasses RLS) may touch the ledger.
