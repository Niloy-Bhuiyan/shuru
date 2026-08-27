# ADR 0003 — Paid placement is separated, not ranked

**Status:** accepted · **Date:** 2026-08-27

## Context

Shuru needed a payment subsystem. The natural product for an internship
platform is employer-side: an employer pays to give one of their listings more
visibility.

The obvious implementation is to boost a paid listing's position in the ranked
feed — that is what most job boards do, and it is what "featured listing"
usually means.

Shuru cannot do that.

The product's entire claim, the one every other decision in this codebase bends
around, is that **what a student sees reflects evidence about their chances**.
Reality Check abstains rather than showing a number it cannot support. Match
scores stay blank on listings that state too little (ADR 0002). RemoteOK
contributes zero listings because zero is the honest count (ADR 0001).

A ranked feed where money moves a listing up is a feed that no longer means
what the rest of the product says it means. The student cannot tell which
signal they are looking at, and there is no honest label that fixes it —
"promoted" on a card inside a ranked list still implies it earned that
position.

## Decision

**Promoted listings are pulled out of the ranked feed entirely and shown in
their own labelled section above it.**

- `src/app/(main)/radar/page.tsx` splits `visible` into `promoted` and `feed`.
  A promoted listing appears in exactly one of them, never both.
- The promoted section carries a heading and a one-line explanation of what
  promotion is.
- `OpportunityCard` renders a `PROMOTED` badge, so the label travels with the
  card onto screens (Saved) that have no promoted section around them.
- Promotion does **not** exempt a listing from any filter. Eligibility,
  deadline, department and search filtering all still apply — paying buys a
  slot in a labelled section, not a bypass of the student's own filters.
- Reality Check and eligibility are untouched by promotion. A promoted listing
  with insufficient outcome data still abstains.

## Consequences

**What this costs.** Less lucrative than ranked boosting; a separate section
gets fewer clicks than the top of the feed. That is the intended trade.

**What it buys.** The ranked feed remains a single honest signal. A student who
learns to read it never has to ask whether position was bought.

**Enforcement is in the database, not the UI.** `featured_until` lives on
`opportunities`, and migration 0014 adds `guard_featured_until`, a trigger that
reverts any change to that column not made by the service role. Employers can
update their own listings through `opportunities_update_owner`, so without the
trigger an employer could grant themselves a promotion with a single PATCH and
never pay. Verified against the live database: an `authenticated`-role UPDATE
setting `featured_until` to a year out leaves the column `NULL`.

**Payment state is server-authoritative.** `payments` has no UPDATE policy for
`authenticated`. Status moves only in the webhook handler, after a signature
check, and `provider_event_id` is UNIQUE so a provider's retry cannot fulfil
twice.

## Revisiting this

If someone later wants ranked boosting, the change is small and the reasoning
above is the thing to argue with — not the code. The honest version of that
change also requires deciding what the ranked feed now claims to be, and
saying so on the screen.
