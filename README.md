<div align="center">

<a href="https://github.com/Niloy-Bhuiyan/shuru">
  <img src="./public/readme/shuru-hero.svg" alt="Shuru — an honest internship platform" width="100%" />
</a>

### Find the right internship. Know where you really stand.

**Shuru** (শুরু — *the beginning*) is an internship platform for students that combines fresh opportunities, evidence-backed matching, application tracking, and an ATS-ready resume studio—without inventing confidence it cannot justify.

[![Next.js](https://img.shields.io/badge/Next.js_14-1B2A3A?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-1B2A3A?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FBFA0?style=for-the-badge&logo=supabase&logoColor=1B2A3A)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-FF7A3C?style=for-the-badge&logo=tailwindcss&logoColor=1B2A3A)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Permission_Required-E5533D?style=for-the-badge)](./LICENSE)

[Why Shuru](#why-shuru) · [Features](#core-experience) · [Architecture](#architecture) · [Documentation](#documentation) · [License](#license)

</div>

---

## Why Shuru

Most internship platforms optimize for more listings and bigger match percentages. Shuru optimizes for **truthful decisions**.

> If the evidence is strong enough, Shuru explains the match. If it is not, Shuru abstains. No fake score. No invented deadline. No made-up salary.

- **Fresh over noisy** — listings are filtered, normalized, deduplicated, and freshness checked.
- **Evidence over confidence theatre** — every match signal can show what produced it.
- **Useful even without AI** — matching, ATS checks, and scoring remain rule-based and testable.

## Core experience

### `01` Internship Radar

One focused feed for employer-posted and responsibly ingested internships, with source attribution, real freshness information, and honest compensation labels.

### `02` Reality Check

Calibrated match information based on profile evidence and verified outcomes. Small cohorts produce **not enough data yet** instead of a meaningless percentage.

### `03` Resume Forge

PDF/DOCX import, structured editing, ATS readiness checks, job-description tailoring, and selectable text-layer PDF export in one dedicated workspace.

### `04` Application Vault

Save opportunities, track application stages, search the pipeline, and receive relevant deadline and status notifications.

## Architecture

<div align="center">

<img src="./public/readme/shuru-architecture.svg?v=afc059c" alt="Animated architecture diagram of the Shuru platform" width="100%" />

<sub>Requests move through role-aware Next.js boundaries; Postgres RLS remains the final authority.</sub>

</div>

The system follows three rules:

1. **The database is the trust boundary.** Supabase Row Level Security protects data even if a route is called directly.
2. **Core decisions stay deterministic.** Eligibility, matching, ATS scoring, and abstention are pure, unit-tested domain functions.
3. **External services are optional and isolated.** A missing AI or delivery key disables that feature cleanly; it never creates fake output.

Shuru deploys as two units: the Next.js application, and a Python retrieval
service (`services/rag`) that answers questions about the free text of listings
with a citation per claim — and abstains when the sources do not support an
answer. The second is optional; without it the feature hides itself.

Read the complete [architecture guide](./docs/ARCHITECTURE.md) for authorization, data flows, ingestion, matching, and delivery details.

## Development

```bash
npm install
npm run dev
```

Shuru requires a configured Supabase project. Environment setup, database migrations, and production deployment are documented in the [deployment guide](./docs/DEPLOYMENT.md).

The pre-release gate:

```bash
npm run typecheck && npm run lint && npm test
npm run test:e2e      # Playwright at 390px and 1440px, incl. accessibility
npm run build         # must print "ƒ Proxy (Middleware)"
npm run verify:rls    # database security invariants + RLS behaviour tests
```

## Documentation

- [Product requirements](./docs/PRD.md) — users, scope, requirements, and non-goals
- [Architecture](./docs/ARCHITECTURE.md) — runtime, authorization, and data pipelines
- [Database](./docs/DATABASE.md) — tables, RLS policies, constraints, and triggers
- [Deployment](./docs/DEPLOYMENT.md) — Supabase and Vercel provisioning
- [Operations runbook](./docs/RUNBOOK.md) — release checks and failure triage
- [Engineering decisions](./docs/decisions) — load-bearing trade-offs and context
- [Retrieval service](./services/rag/README.md) — the Python RAG service: design, API, tuning, limitations

> [!IMPORTANT]
> Read [ADR 0001](./docs/decisions/0001-source-filtering.md) before changing source filters, [ADR 0002](./docs/decisions/0002-match-abstention.md) before changing score availability, and [ADR 0003](./docs/decisions/0003-paid-placement.md) before changing how promoted listings are ranked. All three encode deliberate honesty constraints. [ADR 0004](./docs/decisions/0004-ai-assisted-discovery.md) is a *proposal*, not built — read it before attempting AI-assisted listing discovery, particularly the part explaining why a Claude or ChatGPT subscription cannot be delegated to a third-party app.

## License

> [!WARNING]
> **PROPRIETARY SOFTWARE — NO OPEN-SOURCE LICENSE IS GRANTED.**
>
> Copyright © 2026 Niloy Bhuiyan. All rights reserved. Copying, using, modifying, redistributing, publishing, sublicensing, selling, or creating derivative works from this repository requires prior written permission from Niloy Bhuiyan. Unauthorized use is expressly prohibited.

Read the complete [LICENSE](./LICENSE) before using any part of this project.

---

<div align="center">

### শুরু মানে সূচনা — go open some doors.

Designed and built by [Niloy Bhuiyan](https://github.com/Niloy-Bhuiyan).

[Back to top](#)

</div>
