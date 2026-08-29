-- ============================================================================
-- 0019 — listings found by searching the live web
--
-- WHY THIS EXISTS
--
-- Shuru's ingestion reaches boards with public APIs. No Bangladeshi board and
-- no major BD employer has one — Robi, Grameenphone, bKash and Brac Bank all
-- run custom career pages with nothing behind them. The live corpus shows the
-- consequence: of 27 listings, 26 came from foreign boards and exactly one was
-- entered by hand. Zero Bangladeshi employers were found automatically, in a
-- product that exists for Bangladeshi students.
--
-- A model that searches the live web is the only automated route to those
-- listings. See ADR 0004.
--
-- WHAT THIS MIGRATION ACTUALLY CHANGES
--
-- One value in one CHECK constraint. That is deliberate and it is the whole
-- point: an AI-discovered listing is an ORDINARY PENDING LISTING. It gets no
-- new table, no separate feed, no privileged path, and no exemption from
-- anything.
--
--   - It is inserted with status 'pending', so it lands in the moderation
--     queue an admin already works, alongside employer submissions.
--   - `guard_opportunity_insert` (0003) already forces 'pending' and
--     'shuru' for any non-admin, non-service-role insert, so the only way a
--     row can carry source = 'ai' at all is the service-role discovery route.
--     No client can label a listing as AI-found, and no client can insert one
--     that skips review.
--   - Match, eligibility and abstention treat it exactly like any other row.
--     Fields the source did not state are null, so ADR 0002's abstention fires
--     on it naturally rather than needing a special case.
--
-- The temptation this constraint is resisting is a `verified_by_ai` boolean or
-- an auto-approve path for "high confidence" results. There is no such thing
-- as a high-confidence hallucination detector, and a fabricated internship at
-- a real Dhaka company reaching a student's feed is the failure that ends this
-- product. Verification happens before the insert (the URL is fetched and read
-- server-side); moderation happens after it; neither is skippable.
-- ============================================================================

do $mig$
declare
  c record;
begin
  -- Dropped by DISCOVERY rather than by name, same reasoning as 0018: the
  -- 0003 constraint was created inside a DO block with an explicit name, but
  -- a `drop constraint if exists` that guesses wrong fails SILENTLY and the
  -- old constraint survives to reject every discovery insert at runtime.
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'opportunities'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%arbeitnow%'
  loop
    execute format('alter table public.opportunities drop constraint %I', c.conname);
  end loop;
end;
$mig$;

alter table public.opportunities
  add constraint opportunities_source_check
  check (source in ('shuru', 'remoteok', 'arbeitnow', 'lever', 'ashby', 'adzuna', 'ai'));

comment on column public.opportunities.source is
  'Where the listing came from. ''shuru'' = posted in-product by an employer; '
  '''ai'' = found by searching the live web, with its apply_url fetched and '
  'confirmed server-side before insert. Everything else names an external '
  'board. Shown to students: provenance is disclosed, never hidden.';

-- Discovery inserts land in the same queue an admin already works, so the
-- existing pending index covers them. This one is for the operator question
-- the feature creates — "what has discovery actually produced" — which would
-- otherwise be a sequential scan over every listing.
create index if not exists opportunities_ai_source_idx
  on public.opportunities (created_at desc)
  where source = 'ai';
