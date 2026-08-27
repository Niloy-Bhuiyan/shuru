-- ============================================================================
-- 0014 — payments
--
-- WHAT IS BEING SOLD
--
-- An employer can pay to feature one of their approved listings for a period.
-- A featured listing is shown in a SEPARATE, LABELLED section and carries a
-- "PROMOTED" badge. It is deliberately never mixed into the ranked feed:
-- Shuru's entire product claim is that what a student sees reflects evidence
-- about their chances, and quietly moving a listing up because someone paid
-- would make that claim false. Paid placement that announces itself is honest;
-- paid placement that blends in is not.
--
-- SANDBOX ONLY
--
-- No production payment credentials exist for this deployment. The only
-- provider implemented is `sandbox`, which moves no money. The `provider`
-- column exists so a real one can be added without a schema change, and
-- `payments.is_sandbox` is NOT NULL so no row can be ambiguous about whether
-- it represents real money. Reporting must filter on it.
--
-- SERVER-AUTHORITATIVE
--
-- The browser never sets payment state. `status` moves only in the webhook
-- handler, which runs as the service role after verifying a signature. There
-- is deliberately NO update policy for `authenticated` on this table: an
-- employer can read their own payments and start one, and that is all.
--
-- IDEMPOTENCY
--
-- `provider_event_id` is UNIQUE. Every payment provider retries webhooks, and
-- a retry that granted a second entitlement is the classic double-fulfilment
-- bug. The unique constraint makes the second insert fail at the database
-- rather than relying on the handler remembering to check.
-- ============================================================================

create table if not exists public.payments (
  id uuid primary key default extensions.uuid_generate_v4(),

  -- Which adapter handled this. 'sandbox' moves no money.
  provider text not null check (provider in ('sandbox')),

  -- Belt and braces with `provider`: a future provider added to the check
  -- constraint cannot accidentally inherit "this was pretend".
  is_sandbox boolean not null default true,

  -- The provider's own identifiers.
  provider_session_id text not null,
  provider_event_id text unique,

  company_id uuid not null references public.companies (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete set null,

  -- Who started it. Kept for the audit trail even if they leave the company.
  created_by uuid references auth.users (id) on delete set null,

  purpose text not null check (purpose in ('feature_listing')),

  -- Minor units (paisa / cents). Integer on purpose: floating-point money is
  -- how a total ends up off by a hundredth and nobody can reproduce it.
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),

  -- pending -> succeeded | failed | expired. Only the webhook moves it.
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'expired')),

  -- How long the entitlement lasts once granted.
  entitlement_days integer not null check (entitlement_days > 0),

  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists payments_company_idx on public.payments (company_id);
create index if not exists payments_opportunity_idx on public.payments (opportunity_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_created_by_idx on public.payments (created_by);
create unique index if not exists payments_session_idx
  on public.payments (provider, provider_session_id);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ── the entitlement itself ──────────────────────────────────────────────
-- On the listing, not in a separate table: "is this featured right now" is a
-- property of the listing and is read on every feed query. A join per render
-- to answer it would be the wrong shape.
alter table public.opportunities
  add column if not exists featured_until timestamptz;

comment on column public.opportunities.featured_until is
  'Set ONLY by the payments webhook. A listing is promoted while this is in '
  'the future. Promoted listings are shown in a separate labelled section, '
  'never mixed into the ranked feed.';

create index if not exists opportunities_featured_idx
  on public.opportunities (featured_until)
  where featured_until is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.payments enable row level security;

-- An employer sees their own company's payments; an admin sees everything.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    (select is_admin()) or is_member_of_company(company_id)
  );

-- Starting a checkout writes a `pending` row. The WITH CHECK pins status to
-- 'pending' so a client cannot insert a row that is already 'succeeded'.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (
    is_member_of_company(company_id)
    and created_by = (select auth.uid())
    and status = 'pending'
    and is_sandbox = true
  );

-- No update policy and no delete policy, deliberately. State transitions
-- belong to the webhook handler running as the service role.

grant select, insert on public.payments to authenticated;
grant all privileges on public.payments to service_role;
revoke all privileges on public.payments from anon;
revoke truncate, references, trigger on public.payments from authenticated;

-- ── guard: featured_until is not employer-writable ──────────────────────
-- `opportunities_update_owner` lets a company member update their listing.
-- Without this, an employer could grant themselves a promotion with a single
-- PATCH and never pay at all. The trigger reverts any change to the column
-- that does not come from the service role.
create or replace function public.guard_featured_until()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.featured_until is distinct from old.featured_until
     and not public.is_service_role() then
    new.featured_until := old.featured_until;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_featured_until() from public;
revoke execute on function public.guard_featured_until() from anon;
revoke execute on function public.guard_featured_until() from authenticated;

drop trigger if exists opportunities_guard_featured on public.opportunities;
create trigger opportunities_guard_featured
  before update on public.opportunities
  for each row execute function public.guard_featured_until();
