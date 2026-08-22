# Shuru — Product Requirements Document

**Status:** active · **Owner:** Niloy-Bhuiyan · **Last updated:** 2026-08-22

---

## 1. Product summary

Shuru (শুরু — "the beginning") is an internship platform. Not a general job
board: every surface assumes the user is a student looking for an internship,
and every listing that reaches a student has been filtered to internship-family
roles.

The product's differentiator is **calibrated honesty**. Where competitors show
an invented "95% match", Shuru shows either evidence-backed match information or
an explicit abstention. A number is never fabricated to fill space.

## 2. Problem

Students applying for internships operate blind:

1. **Discovery is fragmented.** Listings are scattered across company career
   pages, ATS boards, Facebook groups and aggregators.
2. **Fit is opaque.** A student cannot tell whether they are a plausible
   candidate or wasting an application.
3. **Applications vanish.** After submitting, students get no signal until a
   rejection — or nothing at all.
4. **Listings go stale.** Expired internships waste effort and erode trust.

## 3. Users

| Role | Needs |
|---|---|
| **Student** | Find real, current internships; understand fit honestly; track applications; be told when something relevant appears. |
| **Employer** | Post an internship, have it reviewed, receive and triage applicants. |
| **Admin** | Keep the platform trustworthy: review employers and listings, act on reports, monitor health. |

## 4. Core student flow

```
Register / Login
  → build profile + upload CV
    → discover real internships
      → see resume/job match (or an honest abstention)
        → save / apply
          → track application status
            → receive relevant alerts
```

## 5. Requirements by area

### 5.1 Authentication
Register, login, logout, email verification, forgot/reset password, Google
OAuth, GitHub OAuth. Secure server-validated sessions, route protection, and
three roles: `student`, `employer`, `admin`.

### 5.2 Internship data
No mock listings reach users. Internships come from:

- **Shuru employer postings** — submitted in-product, admin-approved.
- **Public ATS/job-board adapters** — Lever, Ashby, and the existing RemoteOK
  and Arbeitnow sources, used only where public access is legitimate.
- **Adzuna** — optional aggregator, activated by environment variables.

Every ingested listing is internship-only filtered, normalized to one shape,
deduplicated, freshness-checked, attributed to its source, and re-verified on a
schedule. Adapters are modular so new sources are additive.

### 5.3 Match information
Computed from the student's real resume and profile against the real
requirements of a specific internship, using skills, education, experience,
keywords, location/work preferences, eligibility rules, and evidence drawn from
their projects and profile.

**Constraint:** Shuru never fabricates a qualification the student does not
have, and abstains rather than guessing when evidence is insufficient. This
extends the existing Reality Check abstention rule (n < 8 outcomes ⇒ abstain).

### 5.4 Employer experience
Registration and company profile, internship submission, listing management
across `pending` / `approved` / `rejected` / `expired`, applicant review,
and the actions: shortlist, invite to interview, reject, accept.

### 5.5 Admin
Employer and company review, internship approval / rejection / requested
changes, reported and fraudulent listings, user management, moderation, expired
listing handling, platform statistics, and an append-only audit log of every
admin action.

### 5.6 Application tracking
Student-visible pipeline:

```
Applied → Viewed → Shortlisted → Interview → Accepted / Rejected
```

Employer status changes propagate to the student's application history
automatically; history is append-only so the timeline is never rewritten.

### 5.7 Notifications
An in-app notification center covering new high-fit internships, urgent
internships, saved internships closing soon, application viewed, shortlisted,
interview invitation, rejected, accepted, and employer/application updates.

Alerts are **prioritized, not broadcast**: ranking combines match quality,
deadline proximity and listing freshness, with per-type caps so a student is
not spammed. Browser and email delivery are architecturally prepared —
notifications are persisted and typed independently of their delivery channel —
but only in-app delivery ships initially.

## 6. Design constraint

The existing mobile UI is the visual authority. Its colors, typography and
"cozy retro instrument" pixel identity do not change.

Desktop is a deliberate adaptation of that same language — reorganized
navigation, grids, filter rails and workspaces — never a stretched mobile
layout. Both must read as the same product.

## 7. Explicit non-goals

- Not a general job board (internships only).
- No scraping of sources whose terms prohibit it (LinkedIn, Indeed).
- No fabricated match scores, odds, or qualifications.
- No mocked external service presented as if it were live.

## 8. Success criteria

1. A student completes register → verify → profile → CV → discover → match →
   apply → track, backed entirely by real persisted data.
2. An employer posts an internship, admin approves it, it becomes discoverable,
   and an applicant status change reaches the student automatically.
3. Every listing shown carries a real source and a real freshness state.
4. Match information is either evidence-backed or an explicit abstention.
5. Desktop and mobile are each deliberately designed in one visual language.
