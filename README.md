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

1. **The database is the trust boundary.** Supabase Row Level Security protects data even if a route is called directly. Policies are verified by `npm run verify:rls` (config invariants) and `npm run test:rls` (behaviour, asserting the exact SQLSTATE of each denial).
2. **Core decisions stay deterministic.** Eligibility, matching, ATS scoring, and abstention are pure, unit-tested domain functions. No model decides whether you qualify.
3. **External services are optional and isolated.** A missing AI or delivery key disables that feature cleanly; it never creates fake output.

### Two deployable units

| | Runtime | Responsibility |
| --- | --- | --- |
| **Web application** | Next.js 16 (App Router), React 18, TypeScript strict | UI, route handlers, role-aware middleware, ingestion, matching |
| **Retrieval service** | Python 3.13, FastAPI, LangGraph, LangChain, pgvector | Grounded answers about listing free text, with citations and abstention |

The retrieval service is a separate REST API, not a library. It holds its own
dependencies, its own 63-test suite, and its own failure mode: when it is not
deployed, `/api/ask` reports itself unavailable and the feature hides. The web
app talks to it through one server-only client (`src/lib/rag/client.ts`), so
nothing about the Python stack leaks into the browser bundle.

### The retrieval pipeline

`services/rag` is a **LangGraph `StateGraph`**, not a chain. The branching is
the reason: three of its six nodes can end the run without an answer, and one
of them rejects a draft the model already produced.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> embed_question
    embed_question --> retrieve
    retrieve --> grade
    grade --> generate: passages clear<br/>the distance bound
    grade --> abstain: nothing<br/>relevant enough
    generate --> verify_grounding
    verify_grounding --> abstain: cites nothing, or<br/>cites a passage<br/>that does not exist
    verify_grounding --> [*]: answer + citations
    abstain --> [*]: "I don't know",<br/>with the reason
```

**`verify_grounding` is the point of the whole design.** A model that answers
from a job description will happily invent a stipend or a deadline, and Shuru's
one claim is that it does not manufacture confidence. So the graph reads its own
draft, checks every citation resolves to a passage that was actually retrieved,
and throws the answer away if it does not. Written as nested `if`s, that is
precisely the check an early `return` skips.

| Concern | Choice | Why |
| --- | --- | --- |
| Orchestration | **LangGraph** `StateGraph`, 6 nodes, 2 conditional edges | Branching and self-rejection are real control flow, not a chain |
| Chunking | **LangChain** `RecursiveCharacterTextSplitter` | One well-tested utility; the framework does not own the control flow |
| Vector store | **pgvector** in the same Supabase Postgres (HNSW, cosine) | No new infrastructure; the chunk → listing foreign key cascades |
| Embeddings | **fastembed** ONNX, `bge-small-en-v1.5`, 384-dim, local | A real model with **no API key** — clone the repo and retrieval runs |
| Answer generation | Anthropic, behind an adapter | The only step needing a hosted credential |
| Abstention threshold | **0.46**, measured | On-topic scored 0.239–0.385, off-topic 0.532–0.598. The shipped default of 0.75 answered *"what is the weather in Dhaka?"* from a job description |

The threshold is pinned by `tests/test_threshold.py`, which includes a test
that fails if anyone restores the old default. Prompt-injection defence is
three layers — fenced documents, delimiter sanitising, advisory detection that
never blocks — and `rag_chunks` has no write policy at all, so no user can
inject retrievable text in the first place.

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
