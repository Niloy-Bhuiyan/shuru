# ADR 0001 — Listing filters stay shared; source tag quality does not

- **Status:** Accepted
- **Date:** 2026-08-23
- **Affects:** `src/lib/ingest/normalize.ts` (`matchesFilters`), `src/lib/ingest/health.ts`

## Context

RemoteOK fetches ~100 listings per run and keeps **zero**. That looks like a
broken filter, and the obvious reading is that `matchesFilters` is too strict.

`matchesFilters` requires the combined `title + tags` text to contain an
intern-family term AND a tech term, and none of the seniority exclusions
(`senior`, `lead`, `principal`, …).

Inspecting the live RemoteOK feed shows its tags are close to meaningless:

- `Removalist Offsider` is tagged `golang`
- `Project Systems Specialist` carries 20 tags including `javascript`, `css`, `c`
- **19 of 100** listings carry a `senior` tag regardless of the actual role

Both failure directions follow from that. Unrelated roles match the intern
family through a stray `junior`/`graduate` tag (`Store Manager` did), and a
genuine "Software Engineering Intern" would be **silently dropped** if RemoteOK
attached its `senior` tag — which happens to roughly a fifth of the feed.

## Decision

**Leave `matchesFilters` unchanged.** Do not move seniority or intern-family
matching to the title.

## Evidence

Three candidate rules, measured against both live feeds
(`.local-scripts/probe-filters.mjs`):

| rule | remoteok kept | arbeitnow kept |
| --- | --- | --- |
| **current** (title + tags) | 0 | **11** |
| title-only | 0 | 6 |
| hybrid (seniority + intern from title, tech from tags) | 0 | 6 |

Two things decided it:

1. **No candidate rule rescues RemoteOK.** It yields 0 under all three. The
   feed genuinely contains no tech internships, so the filter is not the cause
   and no filter change is the cure.
2. **Every alternative regresses Arbeitnow, 11 → 6.** Arbeitnow's `job_types`
   is a real structured field where `internship` is authoritative, so its tags
   *should* be trusted. Five legitimate listings would have been destroyed to
   fix a problem that is not currently occurring.

The two sources have **opposite tag quality**, so a single shared rule cannot
be tuned for both. The current rule is right for the source that actually
produces listings.

## Consequences

- RemoteOK contributing 0 is expected, not a defect. It is reported as
  `yielding_nothing` by `assessSourceHealth`, which deliberately does **not**
  classify it as an error — see ADR 0002.
- The latent risk is accepted and recorded: if RemoteOK ever posts a real tech
  internship carrying its `senior` tag, that listing is dropped. This is a
  known cost, not an oversight.
- **If RemoteOK needs fixing later, fix it per-adapter, not in shared
  `matchesFilters`.** Tag trustworthiness is a property of the source, so the
  knob belongs next to the source.
- Re-run `.local-scripts/probe-filters.mjs` against both live feeds before
  changing this. Do not tune the filter against a single source's number.
