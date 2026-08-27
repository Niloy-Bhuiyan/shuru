-- ============================================================================
-- 0013 — RAG index (pgvector)
--
-- Backing store for the Python retrieval service in services/rag.
--
-- WHY THIS LIVES IN THE SAME DATABASE
--
-- The corpus is the listings table. Putting the vector index next to it means
-- the deployment gains no new infrastructure, a chunk's foreign key to its
-- opportunity is enforced by Postgres rather than by hope, and deleting a
-- listing takes its chunks with it. A separate vector database would have to
-- be kept in sync by a process that can silently fall behind — and a stale
-- retrieval index is exactly how a product like this ends up citing a role
-- that no longer exists.
--
-- WHAT IS INDEXED
--
-- Only the free text a listing actually publishes (`description`,
-- `requirements`). Structured fields — deadline, stipend, eligibility rules —
-- are deliberately NOT embedded: they are already queryable exactly, and
-- answering "when does it close?" from a fuzzy nearest-neighbour match instead
-- of the `deadline` column is how a confident wrong date gets shown.
--
-- ACCESS CONTROL
--
-- `rag_chunks` carries no user data — it is derived from listings that are
-- already publicly visible once approved. RLS is enabled and the read policy
-- mirrors `opportunities_select`'s public arm: a chunk is visible only while
-- its parent listing is approved and unexpired. The retrieval service uses the
-- service role, so it must (and does) re-apply the same filter in its query;
-- the policy is the second line, not the only one.
-- ============================================================================

create extension if not exists vector with schema extensions;

create table if not exists public.rag_chunks (
  id            uuid primary key default extensions.uuid_generate_v4(),

  -- Cascade: a deleted listing must not leave retrievable text behind.
  opportunity_id uuid not null
    references public.opportunities (id) on delete cascade,

  -- Which field the text came from, so a citation can say where it is.
  source_field  text not null check (source_field in ('description', 'requirements')),

  -- 0-based position within that field, for stable ordering and citation.
  chunk_index   int not null check (chunk_index >= 0),

  content       text not null check (length(content) > 0),

  /*
   * 384 dimensions = BAAI/bge-small-en-v1.5, the default local model.
   *
   * The dimension is fixed by the column type, so switching to a model with a
   * different width is a migration, not a config change. The service refuses
   * to start on a mismatch rather than writing vectors that would silently
   * never match anything — see services/rag/app/config.py.
   */
  embedding     extensions.vector(384) not null,

  -- Which model produced the vector. Lets a re-index detect and replace rows
  -- from an older model instead of mixing incomparable vector spaces.
  embedding_model text not null,

  -- Content hash of the source field at index time. A re-index skips a chunk
  -- whose source text has not changed, which is what makes re-running cheap.
  content_hash  text not null,

  created_at    timestamptz not null default now(),

  unique (opportunity_id, source_field, chunk_index)
);

create index if not exists rag_chunks_opportunity_idx
  on public.rag_chunks (opportunity_id);

create index if not exists rag_chunks_model_idx
  on public.rag_chunks (embedding_model);

/*
 * HNSW over cosine distance.
 *
 * Chosen over ivfflat: it needs no training pass over a populated table, so it
 * behaves correctly on a corpus this size (tens of chunks today) and keeps
 * behaving correctly as it grows. Cosine matches the normalized vectors the
 * embedding models emit.
 */
create index if not exists rag_chunks_embedding_idx
  on public.rag_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.rag_chunks enable row level security;

drop policy if exists rag_chunks_select on public.rag_chunks;
create policy rag_chunks_select on public.rag_chunks
  for select using (
    exists (
      select 1 from public.opportunities o
      where o.id = rag_chunks.opportunity_id
        and o.status = 'approved'
        and (o.expires_at is null or o.expires_at > now())
    )
  );

-- Writes are the indexer's job, and it runs as the service role (which
-- bypasses RLS). No write policy exists, so no signed-in user can insert
-- text that would later be retrieved and quoted as if a company had published
-- it — that would be a content-injection path straight into cited answers.

grant select on public.rag_chunks to authenticated;
grant all privileges on public.rag_chunks to service_role;

-- Keep 0012's rule: anon reaches nothing, and nobody gets TRUNCATE/REFERENCES/
-- TRIGGER on a table they do not own.
revoke all privileges on public.rag_chunks from anon;
revoke truncate, references, trigger on public.rag_chunks from authenticated;
