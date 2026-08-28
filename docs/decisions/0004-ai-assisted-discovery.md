# ADR 0004 — AI-assisted listing discovery uses the student's own API key, and every result is evidence-gated

- **Status:** Proposed — design only, nothing built
- **Date:** 2026-08-28
- **Affects:** would touch `src/lib/ingest/`, `src/lib/agent/`, `supabase/migrations/`, `/you`, `/admin`

## Context

Shuru's ingestion pipeline reaches boards with public APIs. No Bangladeshi job
board and no major BD employer has one — Robi, Grameenphone, bKash and Brac
Bank all run custom career pages with no ATS behind them. The consequence is
recorded in `src/app/(operator)/admin/listings/new/page.tsx`: scraping yields
remote roles only, and **every local internship — the ones this product exists
for — has to be entered by hand.**

The live corpus shows it. Of 27 listings: `arbeitnow` 18, `ashby` 8, `shuru`
(hand-entered) 1. Zero are Bangladeshi employers found automatically.

The proposal is to close that gap with a language model that searches the live
web, so a student can ask for BD internships and get real ones.

## The delegation question, settled first

The original request was to let a student **authenticate their Claude Pro/Max
or ChatGPT Plus/Codex subscription** with Shuru, and have Shuru search using
that subscription.

**This is not possible and must not be attempted.** Those subscriptions are
licensed for first-party surfaces. Neither Anthropic nor OpenAI publishes an
OAuth flow that delegates a consumer subscription to a third-party
application. The only mechanisms that would "work" are harvesting session
cookies or driving a headless browser as the signed-in user. Both violate the
providers' terms, both break on any login change, and both require Shuru to
hold a credential that grants full account access — for a product whose entire
claim is that it is careful with what it asserts.

**Decision: bring-your-own API key instead.** The student supplies an Anthropic
or OpenAI **API key**, which is a real, supported, revocable credential scoped
to metered API access. Both providers ship a first-class server-side web search
tool, so the search is genuine. The student pays their own tokens, which also
removes the per-instance rate limit as a scaling concern.

## Decision

Three parts, and the third is the one that matters.

### 1. Key handling

- Stored in a new `user_api_keys` table: `user_id`, `provider`
  (`anthropic` | `openai`), ciphertext, `last_four`, `created_at`.
- Encrypted at rest with a server-held key (`pgcrypto`, or application-side
  AES-GCM with `API_KEY_ENCRYPTION_SECRET`). RLS: a user may insert and delete
  their own row and read only `provider` and `last_four` — **never** the
  ciphertext. `anon` gets nothing.
- Decrypted only inside a route handler, never sent to the client, never
  logged. `src/lib/agent/` already isolates providers behind an adapter; the
  key becomes a parameter to that adapter rather than a new code path.
- Revocable from `/you` with one control, and the UI states plainly what the
  key is used for and that it is billed to the student's own account.

### 2. Discovery pipeline

A new adapter under `src/lib/ingest/` that is *not* a board adapter: it takes a
query (department, location, work mode from the student's profile), runs the
provider's web search tool, and returns candidate listings. It reuses the
existing `normalize` and `dedupe` stages so a discovered listing cannot
duplicate an ingested one.

### 3. The evidence gate — the load-bearing part

A model searching the web **will** produce listings that do not exist,
deadlines it inferred, and stipends it guessed. That is the exact failure mode
ADR 0002 exists to prevent, arriving through a new door. So:

- **No source URL, no listing.** Every candidate must carry a URL, and the
  pipeline **fetches that URL server-side and confirms it resolves** and
  contains the company and role string. A candidate that fails is dropped, not
  downgraded.
- **Every field the source does not literally state stays `null`.** No inferred
  deadlines, no inferred compensation, no inferred eligibility rules. The match
  engine then abstains on it exactly as it does today (ADR 0002), and
  `MIN_COVERAGE` is not lowered to compensate.
- **Nothing reaches the feed directly.** A discovered listing is inserted with
  `status: 'pending'` and a new `provenance: 'ai-discovered'` value, landing in
  the admin moderation queue that already exists. `guard_opportunity_insert`
  already rejects any non-`pending` status from a non-admin, so this is
  enforced by the database, not by the pipeline's good intentions.
- **Provenance is shown, not hidden.** A student seeing an AI-discovered
  listing after approval sees where it came from.

## Rationale

The tempting shortcut is to let discovered listings flow into the radar feed
directly — it is the version that demos well, and the queue is friction.

It is also the version that ends Shuru. The product's one claim is that what a
student sees reflects evidence. A hallucinated internship at a real Dhaka
company, with a plausible deadline and a plausible stipend, is not a bug in a
feature; it is the product asserting something false about a student's
future. A student who applies to a listing that never existed has lost the
thing Shuru is supposed to protect.

Routing through moderation costs latency and admin time. Fetching and
verifying every URL costs a round trip per candidate. Both are the price of
the claim, and the claim is the product.

The BYOK decision has a second benefit worth naming: it makes the cost of a
bad search land on the person who asked for it, which is a natural brake on
volume that no rate limit has to enforce.

## Consequences

- A student without an API key sees exactly what they see today. Discovery is
  additive; nothing regresses when it is absent, and the entry point hides
  itself when no key is set — the same rule the agent dock follows.
- Admin moderation load grows with discovery volume. If that becomes the
  bottleneck, the answer is a better queue, **not** auto-approval.
- Shuru holds encrypted third-party credentials for the first time. That is a
  real new liability and the reason the key is write-only from the client's
  perspective, and why `last_four` exists so a student can identify a key
  without the system ever returning it.
- Verification cannot detect a *stale* listing — a real URL for a role that
  closed last month resolves fine. Deadlines therefore stay `null` unless
  stated, and the existing expiry rules apply.

## Not decided here

Whether discovery runs on demand (student presses a button) or on a schedule.
On-demand is the smaller first version and the one that keeps token spend
visibly tied to a student's own action.
