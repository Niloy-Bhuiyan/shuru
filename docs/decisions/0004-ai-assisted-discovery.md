# ADR 0004 — AI-assisted listing discovery, and every result is evidence-gated

- **Status:** **Accepted and built (2026-08-29)** — with one decision reversed; see the amendment below
- **Date:** 2026-08-28, amended 2026-08-29
- **Affects:** `src/lib/discovery/`, `src/lib/agent/websearch.ts`, `src/app/api/discover/`, `src/app/(main)/discover/`, migration 0019

## Amendment (2026-08-29) — the key is the OPERATOR'S, not the student's

The delegation finding below is unchanged and was the reason this ADR exists:
a Claude Pro/Max or ChatGPT Plus subscription **cannot** be spent by a
third-party app. Anthropic banned it on 2026-02-20 and enforced it in billing
on 2026-04-04. Nothing about that has moved.

What changed is who supplies the API key. This ADR chose bring-your-own-key.
The repository owner chose the deployment's own key instead, and that is what
shipped. The trade is explicit:

| | BYOK (originally decided) | Operator key (built) |
| --- | --- | --- |
| Who pays | The student | The operator |
| Setup before first use | Buy an API key | None |
| Can a visitor try it | No | Yes |
| Encrypted third-party credentials at rest | Yes — a real new liability | **None** |
| Natural brake on volume | The student's own bill | Pro gating + the shared agent rate limit |

The liability argument in *Consequences* below — "Shuru holds encrypted
third-party credentials for the first time" — is the strongest point in this
ADR, and the operator-key version simply does not incur it. `user_api_keys`
was never created. The volume brake that BYOK gave for free is replaced by two
weaker but real ones: discovery is a Pro feature, and it shares the agent's
per-user rate limit.

**Everything in "The evidence gate" below is built exactly as written**, and
that was always the load-bearing part. Nothing about who pays changes whether
a listing is real.

### What "built" means, concretely

- `src/lib/agent/websearch.ts` — the provider's own server-side search, kept
  separate from `askAgent` because grounding tools and function declarations do
  not compose.
- `src/lib/discovery/prompt.ts` — the system prompt, including the instruction
  that returning zero entries is a valid answer. The student's free-text ask is
  fenced so it cannot become an instruction.
- `src/lib/discovery/parse.ts` — extracts JSON from a reply wrapped in
  anything, and drops every row without a company, a role and an http(s) URL.
- `src/lib/discovery/verify.ts` — **the gate.** Fetches each URL and confirms
  the page names both the company and the role, matching visible text only.
- `POST /api/discover` — Pro-gated, inserts survivors as `status: 'pending'`
  with `source: 'ai'`, and returns the rejections rather than hiding them.
- Migration 0019 — one value added to one CHECK constraint. An AI-discovered
  listing is an ordinary pending listing with no privileges.

### Still not decided

On-demand vs scheduled: **on-demand shipped**, as this ADR suggested. There is
no cron path for discovery.

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

The mechanisms do exist. An earlier draft of this ADR said no such OAuth flow
existed, which was wrong and is corrected here, because the difference between
"impossible" and "prohibited" changes what you build.

**Anthropic: exists, explicitly banned, and now pointless.** `claude
setup-token` mints a one-year OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`), and
third-party tools did route subscription traffic through it. Anthropic closed
that deliberately: the terms were updated on **2026-02-20** so developers may
no longer offer Claude.ai login or route requests on behalf of users with
Free, Pro or Max credentials, and on **2026-04-04** billing enforcement landed
— third-party traffic stopped drawing on subscription quota and bills against
a separate prepaid balance instead. So it is both against the terms and
economically useless: it would not spend the subscription a student is trying
to use.

**OpenAI: not restricted the same way, but undocumented.** The Codex
device-code flow can be driven from a web app, and at least one project does
exactly that. But OpenAI's own auth documentation presents device codes as a
headless-CLI convenience and describes no third-party integration path, and
the author of the best-known implementation says publicly that they do not
know whether it complies with the terms. It works today; nothing says it is
allowed to.

Anthropic's timeline is the base rate for how this ends. A gray area existed
for months, tools were built on it, and it closed in one terms update with
billing enforcement six weeks later.

Worth separating two things that get conflated: **"Sign in with ChatGPT" as
identity** — the Sign-in-with-Google equivalent - is legitimate and supported.
**Spending the user's subscription quota** through that login is the
undocumented part.

**Decision: bring-your-own API key is the supported path.** The student
supplies an Anthropic or OpenAI **API key**, which is a real, supported,
revocable credential scoped to metered API access. Both providers ship a
first-class server-side web search tool, so the search is genuine. The student
pays their own tokens, which also removes the per-instance rate limit as a
scaling concern.

If the OpenAI subscription route is wanted, it goes behind the same provider
adapter as a **second, clearly experimental** option — never the only way
discovery works. Then a policy change degrades one feature instead of breaking
the product. Cookie harvesting and driving a headless browser as the signed-in
user stay out of scope in every case: both would have Shuru holding a
credential that grants full account access.

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

## Sources for the delegation findings

- Anthropic authentication and `claude setup-token`:
  https://code.claude.com/docs/en/authentication
- Anthropic terms change (2026-02-20) and billing enforcement (2026-04-04):
  https://alternativeto.net/news/2026/2/anthropic-officially-bans-using-subscription-authentication-for-third-party-claude-use
- OpenAI Codex authentication (device code presented as a headless-CLI
  convenience, no third-party path documented):
  https://learn.chatgpt.com/docs/auth
- The web reimplementation of the Codex device flow, including its author's
  own uncertainty about compliance:
  https://explainx.ai/blog/login-with-chatgpt-codex-subscription-oauth-2026

These are mostly secondary sources. **Confirm directly with OpenAI before
building on the subscription route.**

## Not decided here

Whether discovery runs on demand (student presses a button) or on a schedule.
On-demand is the smaller first version and the one that keeps token spend
visibly tied to a student's own action.
