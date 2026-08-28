# Deploying the retrieval service

The service is implemented, tested (63 pytest) and its corpus is indexed. It
is simply not hosted, which is why `/api/ask` reports itself unavailable in
production rather than failing — see `src/lib/rag/client.ts`.

Everything below needs an account only you can create. Nothing here requires a
local Docker install.

---

## What you need first

**1. A service token.** One shared secret, used by both sides. Generate it:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it somewhere safe — you will paste it twice, and the two must match
exactly or every call from the web app is refused with a 401.

**2. Your Supabase service-role key**, from
Project Settings → API → `service_role`. It bypasses RLS, so it is
server-only and must never appear in the Vercel `NEXT_PUBLIC_*` namespace.

**3. An Anthropic API key** (optional). Retrieval works without it because the
embeddings run locally; only the *written answer* needs a hosted credential.
Without it the service reports itself unavailable rather than answering from a
degraded path.

---

## Deploy (Render — the documented default)

Chosen because it builds straight from the Dockerfile in this repo with no CLI
and no local Docker.

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect the `Niloy-Bhuiyan/shuru` repository. Render reads
   `services/rag/render.yaml`.
3. It will prompt for the four values marked `sync: false`:

   | Variable | Value |
   | --- | --- |
   | `SHURU_RAG_SUPABASE_URL` | `https://lciujpypigtbzhjawghf.supabase.co` |
   | `SHURU_RAG_SUPABASE_SERVICE_KEY` | your service-role key |
   | `SHURU_RAG_SERVICE_TOKEN` | the token generated above |
   | `SHURU_RAG_ANTHROPIC_API_KEY` | your Anthropic key, or leave blank |

4. Deploy. The first build takes a few minutes: it bakes the ONNX embedding
   model into the image so the first real question is not a 35-second hang.
5. Copy the resulting URL, e.g. `https://shuru-rag.onrender.com`.

> **Free tier caveat.** A free web service sleeps after inactivity and takes
> ~30s to wake, so the first question after a quiet period is slow. Survivable
> — `/api/ask` has an explicit unavailable state — but upgrade the plan if it
> matters.

---

## Point the web app at it

In the Vercel project, **Production** environment:

| Variable | Value |
| --- | --- |
| `SHURU_RAG_URL` | the Render URL, no trailing slash |
| `SHURU_RAG_SERVICE_TOKEN` | **the same token**, byte for byte |

Then redeploy the Next.js app so the new variables are picked up. Adding an
environment variable does not rebuild by itself.

---

## Verify — do not skip this

```bash
# 1. Alive, and unauthenticated by design.
curl -s https://YOUR-SERVICE.onrender.com/health

# 2. Config and database reachable. Token-gated, so a working process with a
#    broken connection cannot pass this the way it passes /health.
curl -s -H "Authorization: Bearer YOUR_TOKEN" \
  https://YOUR-SERVICE.onrender.com/ready

# 3. Wrong token must be refused.
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong" \
  https://YOUR-SERVICE.onrender.com/ready      # expect 401

# 4. End to end through the web app, signed in, from the browser:
#    open any opportunity that has a real description and ask a question.
```

**The check that actually matters** is not that it answers. It is that it
*abstains* correctly. Ask something the listings cannot support — "what is the
weather in Dhaka?" — and it must say it does not know rather than answering
from a job description. If it answers that, `SHURU_RAG_MAX_COSINE_DISTANCE`
has drifted off 0.46 and the abstention gate is not doing its job.

---

## Reindexing

The corpus is already indexed (27 chunks across 5 listings; the other 22
listings publish no prose, which is the expected outcome and not a gap). After
ingesting new listings:

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  https://YOUR-SERVICE.onrender.com/reindex
```

---

## Alternatives

`render.yaml` is the only committed config, but nothing in the service is
Render-specific — it is a plain Dockerfile listening on `$PORT`.

- **Fly.io** — `fly launch --dockerfile services/rag/Dockerfile`, then
  `fly secrets set` for the four values. Better cold-start behaviour, needs
  the CLI.
- **Railway / Google Cloud Run** — point at the same Dockerfile.

Whatever you choose, the two invariants are the same: `SHURU_RAG_SERVICE_TOKEN`
must match on both sides, and `SHURU_RAG_EMBEDDING_MODEL` must not change
without reindexing, because a different model means a different vector space
and mismatched vectors return nothing relevant *without erroring*.
