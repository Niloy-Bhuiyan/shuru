# Shuru retrieval service

A Python REST service that answers a student's free-text question about
internship listings **using only the text those listings actually publish**,
with a citation for every claim — and abstains when the sources do not support
an answer.

---

## 1. Why this exists

Shuru's structured data is already queryable: deadlines, stipends and
eligibility rules live in columns, and the web app reads them exactly. What it
could not answer was anything about the **prose** — the 4,000-character job
descriptions that boards like Ashby publish, where the real requirements live:

> *"Does this role actually need React, or is that a nice-to-have?"*
> *"What does the posting say about working from outside the US?"*

That is a retrieval problem, not a SQL one. And it is a retrieval problem with
an unusually sharp honesty constraint, because Shuru's defining product rule is
that it never manufactures confidence the evidence does not support.

That constraint shapes the whole design:

- Every claim carries a citation to a specific listing and passage.
- Retrieval has a **distance bound**, so "nothing relevant" is a real outcome
  rather than "here is the least-bad match".
- An answer with no citation is **rejected by the pipeline**, not shown.
- Most listings publish no description at all. On those, the honest answer is
  "this listing does not say", and that is what comes back.

Concretely, of the 27 listings in the live database, **5** carry indexable
prose. The service is expected to abstain on questions about the other 22, and
that is the feature, not a gap.

## 2. Why LangGraph and LangChain

Neither is decoration; each replaces something worse.

**LangGraph** runs the pipeline as an explicit state machine because the
pipeline is not a straight line — it has three places where it can stop and
abstain, and one where it rejects its own draft:

```
embed_question → retrieve → grade ──────► abstain (nothing relevant)
                              │
                           generate ────► abstain (no provider configured)
                              │
                       verify_grounding ► abstain (answer not supported)
                              │
                            answer
```

Written as nested `if`s, this is exactly the shape of code where someone adds
an early return and the grounding check silently stops running on one branch.
As a graph, every edge is declared and `abstain` is a real terminal state.

**LangChain** supplies `RecursiveCharacterTextSplitter`, which splits on
paragraph → line → sentence → word boundaries. Chunking is the part of a RAG
pipeline that looks trivial and is not: a naive fixed-width split severs "3+
years experience" from "internships count", and the retrieved fragment then
supports the opposite claim.

## 3. Architecture

```
Next.js  ──POST /api/ask──►  route handler        (verifies the session)
                                   │
                                   ├─ service token (server-only)
                                   ▼
                            FastAPI /ask
                                   │
                            LangGraph pipeline
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
          fastembed (local ONNX)       Anthropic Messages API
          384-dim, no API key          (written answer only)
                     │
                     ▼
          Postgres + pgvector  ── the SAME Supabase database
          public.rag_chunks       the web app already uses
```

**The vector store is the app's own Postgres.** No new infrastructure, the
chunk→listing foreign key is enforced by the database, and deleting a listing
takes its chunks with it. A separate vector database would need a sync process
that can silently fall behind — and a stale retrieval index is how a product
like this ends up citing a role that closed last month.

**Embeddings run locally.** `fastembed` executes a real ONNX model
(`BAAI/bge-small-en-v1.5`, 384-dim) in-process: no API key, no torch, ~100 MB.
This is deliberate — the retrieval half of the service can be run and verified
by anyone who clones the repo. Only the *written answer* needs a hosted
credential.

## 4. Run it

```bash
cd services/rag
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt    # POSIX: .venv/bin/pip
cp .env.example .env                                  # then fill it in
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

Index the corpus (safe to re-run; incremental by content hash):

```bash
curl -X POST localhost:8000/reindex -H "Authorization: Bearer $SHURU_RAG_SERVICE_TOKEN"
```

Tests need no database and no credentials:

```bash
.venv\Scripts\python -m pytest
```

## 5. API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Liveness. Returns `{"status":"ok"}` and deliberately nothing else — an open endpoint listing configured providers tells a stranger what this deployment runs. |
| `GET` | `/ready` | bearer | Operator view: what is configured, and the **exact** env var names still missing. |
| `POST` | `/ask` | bearer | `{question, user_id}` → `{answer, abstained, abstain_reason, citations[], took_ms}` |
| `POST` | `/reindex?force=` | bearer | Rebuild the index from the listings table. |

Authentication is a shared bearer token (`SHURU_RAG_SERVICE_TOKEN`), compared
in constant time against a SHA-256 digest so neither its contents nor its
length leak through timing. **An unset token refuses every request** rather
than running open.

`user_id` is supplied by the Next.js route from the *verified session*, never
from the browser, so a client cannot spend another student's quota.

### Abstention reasons

| `abstain_reason` | Meaning |
|---|---|
| `no_relevant_sources` | Nothing in the corpus was within the distance bound. Usually correct — most listings publish no prose. |
| `generation_not_configured` | Retrieval worked; no answer key is set. **Citations are still returned.** |
| `answer_not_supported_by_sources` | A draft was produced but cited nothing traceable, so it was discarded. |

## 6. Untrusted content

Everything in the index came from an external job board or an employer's
listing form. It reaches the model inside the prompt, which makes it a
prompt-injection surface. Three layers, in order of how much they can be
relied on:

1. **Structural (strongest).** Retrieved text is fenced in
   `<<<SHURU_DOCUMENT>>>` delimiters, and the system prompt states that
   everything inside is untrusted quoted material. The model is never asked to
   follow it.
2. **Sanitising.** Delimiter sequences *inside* a document are neutralised, so
   a listing cannot close its own fence and escape into instruction context.
   Only the delimiters are touched — this service quotes sources, and silently
   rewriting a company's words would make every citation a misquote.
3. **Detection (weakest, advisory).** Obvious injection phrasing is flagged and
   logged, and surfaces as `suspected_injection` on a citation. It is **not**
   used to block, because a blocklist of phrasings is trivially evaded and
   would give false confidence.

There is also no write policy on `rag_chunks`. A signed-in user cannot insert
text that would later be retrieved and quoted as if a company had published it.

## 7. Known limitations

Written down rather than papered over:

- **Grounding verification is structural, not semantic.** `verify_grounding`
  rejects an answer that cites nothing, or that cites a passage number which
  does not exist. It does **not** verify that citation `[2]` supports the
  specific sentence it is attached to. Doing that properly needs a second model
  call per answer; the cheap check catches the failure that actually happens (a
  fluent paragraph with no references) without doubling cost on every request.
- **Descriptions are truncated at 4,000 characters** by the ingestion pipeline
  upstream of this service. Four of the five indexed listings hit that ceiling
  exactly, so their tail content is not retrievable.
- **The rate limit is per process.** A cost seatbelt, not an abuse control —
  same trade the web app makes for its agent cap. A multi-instance deployment
  gets one counter per instance.
- **`local` is the only embedding provider implemented.** A hosted provider
  plugs in at `app/embeddings.py`; the model width is fixed at 384 by the
  `vector(384)` column, so changing it is a migration, not a config change.
- **Only `description` and `requirements` are indexed.** Structured fields are
  deliberately excluded: answering "when does it close?" from a fuzzy
  nearest-neighbour match instead of the `deadline` column is precisely how a
  confident wrong date reaches a student.

## 8. Deployment

The service is a standard ASGI app; anything that runs `uvicorn` works
(Fly.io, Render, Railway, Cloud Run, a container on a VM).

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Notes that matter in production:

- **Not on Vercel.** Vercel's Python runtime is serverless-function shaped;
  this service loads an ONNX model into memory and benefits from keeping it
  there. Run it as a long-lived process.
- **First request pays for the model load** (~35 s cold, including the initial
  model download). Keep at least one instance warm, or pre-warm on boot.
- Set `SHURU_RAG_DATABASE_URL` to the **pooled** Supabase connection string if
  the platform recycles connections aggressively.
- Point the web app at it with `SHURU_RAG_URL` and share
  `SHURU_RAG_SERVICE_TOKEN` between the two. Both are server-only.
- Re-run `/reindex` after each ingestion run so the index does not fall behind
  the listings table.
