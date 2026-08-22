# ADR 0002 — The match engine abstains rather than inventing a score

- **Status:** Accepted
- **Date:** 2026-08-23
- **Affects:** `src/lib/matching.ts`, `src/lib/ingest/health.ts`

## Context

`applications.match_score` and `notification_preferences.min_match_score` both
assume a match engine exists. `src/lib/matching.ts` scores four factors:

| factor | weight |
| --- | --- |
| skills | 0.50 |
| eligibility | 0.30 |
| location | 0.10 |
| work mode | 0.10 |

Checked against the 12 real listings in the production database:

- **0 of 12** state `skills_required`
- **0 of 12** have a `description` or `requirements`
- all 12 have `eligibility_rules` whose hard rules (`min_cgpa`,
  `min_semester`, `allowed_departments`) are **all null** — the only content is
  an `other_text` note: *"Requirements not structured — read the posting."*
- all 12 do state `location` and `work_mode`

So the only judgeable factors are location and work mode: **0.2 of 1.0 weight**,
below the `MIN_COVERAGE` threshold of 0.4.

## Decision

**The engine returns `score: null` for every listing it cannot judge, and the
threshold stays at 0.4.** An `other_text` note is explicitly not treated as a
stated eligibility rule.

Rejected: inferring skills from the role title (e.g. "Frontend Developer
Intern" → React). Rejected: lowering `MIN_COVERAGE` to 0.2 so current listings
score.

## Rationale

Both rejected options produce a number that no evidence supports. With only
location and work mode judgeable, a student matching on both would be shown as
a ~100% match on the strength of *"this listing is remote and you like
remote"* — while the engine knows nothing whatsoever about skill fit.

That is precisely the failure mode Shuru exists to avoid. Reality Check already
abstains on a thin outcome sample rather than printing a confident-looking
number; the match engine takes the same stance for the same reason. A wrong
number is worse than no number, because a student acts on it.

Title inference is the same error with extra steps: a keyword hit in a
job title is not evidence of requirements.

## Consequences

- **Matching is inert on ingested listings and will stay that way** until
  listings carry real skill data. Two paths supply it:
  - employer-posted listings (`source = 'shuru'`), which state skills at
    creation — the employer portal is the primary route;
  - richer adapters — `LEVER_COMPANIES`, `ASHBY_COMPANIES`, `ADZUNA_APP_ID` /
    `ADZUNA_APP_KEY` are currently unset, and those boards expose structured
    requirement data.
- `meetsAlertThreshold` never fires on an abstention, so a low
  `min_match_score` cannot turn "we don't know" into a notification.
- `rankOpportunities` sorts abstentions last — unjudgeable is not evidence of
  a poor match, but it must not outrank a listing that genuinely scored.
- **Do not "fix" the null scores by weakening the threshold.** The regression
  test in `src/lib/__tests__/matching.test.ts` pins the real ingested shape; if
  it starts returning a number, that number is not backed by data.

---

## Addendum (2026-08-23) — descriptions are not requirements

After `LEVER_COMPANIES` / `ASHBY_COMPANIES` were configured, the database
gained 22 listings carrying full `description` text (14 Lever, 8 Ashby) while
still carrying **zero** structured `skills_required`. That looked like the
"sufficient evidence" threshold this ADR anticipated, so extracting skills
from the description text was evaluated.

**Rejected.** Reading the actual stored descriptions shows why:

- **Most of the text is company marketing, not requirements.** Palantir's
  postings open with *"Palantir builds the world's leading software for
  data-driven decisions and operations…"*. A vocabulary match hits `data` and
  `software` in a paragraph that states no requirement at all, so a student
  listing "data" as a skill would score a match against boilerplate.
- **The corpus is multilingual.** One Palantir internship posting is written
  entirely in French. An English skill vocabulary silently under-matches it,
  producing a *lower* score for a listing that is no worse a fit — bias
  disguised as measurement.
- **There is no reliably delimited requirements section** to scope extraction
  to, so there is no way to separate "we use Kubernetes" from "you need
  Kubernetes".

A description proves a listing has prose. It does not establish that any
particular skill is required. Extracting from it would reproduce the exact
failure this ADR rejects, one layer down.

**The threshold that actually matters is structured skills, not text.** It is
met by employer-posted listings, where `/employer/listings/new` asks for
required skills directly and the form says why. Scraped listings continue to
abstain, and that remains correct.
