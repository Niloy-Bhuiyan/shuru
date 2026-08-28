-- ============================================================================
-- 0015 — vector search over PostgREST
--
-- WHY
--
-- The retrieval service was written against a direct Postgres connection
-- (`SHURU_RAG_DATABASE_URL`), which needs the database password. That password
-- is not derivable from anything else in the project — not from the
-- service-role key, not from the management API — so a deployment that has
-- every other credential still could not run the indexer or answer a query.
--
-- Supabase already exposes the database over PostgREST, and the service-role
-- key is enough to read and write through it. The one thing PostgREST cannot
-- express is `order by embedding <=> query`, because `<=>` is an operator and
-- not a filter. This function is that missing piece: with it, the whole
-- service runs on the service-role key alone.
--
-- SECURITY INVOKER, deliberately
--
-- Not `SECURITY DEFINER`. As an invoker function it runs with the caller's
-- rights, so RLS on `rag_chunks` and `opportunities` still applies:
--
--   * called by `service_role` (the indexer / retrieval service) → RLS is
--     bypassed as it is for any service-role query, and the WHERE clause below
--     re-applies the visibility rule anyway;
--   * called by `authenticated` → `rag_chunks_select` restricts the rows, so a
--     signed-in user cannot use this to reach a listing they could not read
--     directly.
--
-- A `SECURITY DEFINER` version would have been a way to read the whole corpus
-- through `/rest/v1/rpc/`, and would also have tripped the
-- "only policy helpers are SECURITY DEFINER + authenticated-callable"
-- invariant in supabase/verify-rls.sql.
-- ============================================================================

create or replace function public.match_rag_chunks(
  query_embedding extensions.vector(384),
  match_count int default 8,
  max_distance double precision default 0.75,
  filter_opportunity uuid default null
)
returns table (
  opportunity_id uuid,
  source_field text,
  chunk_index int,
  content text,
  distance double precision,
  company text,
  role text,
  apply_url text,
  source text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.opportunity_id,
    c.source_field,
    c.chunk_index,
    c.content,
    (c.embedding operator(extensions.<=>) query_embedding)::double precision as distance,
    o.company,
    o.role,
    o.apply_url,
    o.source
  from public.rag_chunks c
  join public.opportunities o on o.id = c.opportunity_id
  where o.status = 'approved'
    and (o.expires_at is null or o.expires_at > now())
    and (filter_opportunity is null or c.opportunity_id = filter_opportunity)
    and (c.embedding operator(extensions.<=>) query_embedding) <= max_distance
  order by c.embedding operator(extensions.<=>) query_embedding
  limit greatest(match_count, 1);
$$;

-- Same posture as every other function here: PUBLIC gets nothing (Postgres
-- grants EXECUTE to PUBLIC by default and both API roles inherit through it —
-- see migration 0009), then grant back deliberately.
revoke execute on function public.match_rag_chunks(extensions.vector, int, double precision, uuid) from public;
revoke execute on function public.match_rag_chunks(extensions.vector, int, double precision, uuid) from anon;

grant execute on function public.match_rag_chunks(extensions.vector, int, double precision, uuid) to authenticated;
grant execute on function public.match_rag_chunks(extensions.vector, int, double precision, uuid) to service_role;
