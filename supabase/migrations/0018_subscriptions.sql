-- ============================================================================
-- 0018 — Pro subscriptions, payment methods, and admin transaction review
--
-- WHAT IS BEING SOLD, AND TO WHOM
--
-- 0014 sold one thing to one audience: an employer promoting a listing. This
-- migration adds the second product — a personal **Pro** subscription bought
-- by an individual for themselves. Both settle through the same `payments`
-- ledger, because "show me every payment" and "approve this transaction" are
-- one question, and answering it from two tables is how a reconciliation bug
-- starts.
--
-- TWO SETTLEMENT PATHS, AND WHY BOTH ARE REAL
--
--   provider_webhook — the payer is redirected to a hosted checkout and the
--                      provider reports the outcome over a signed webhook.
--                      This is the `card` and `demo` path. The sandbox
--                      provider from 0014 drives it: signature check,
--                      idempotency key and server-authoritative fulfilment are
--                      all genuine, only the money is not.
--
--   manual_review    — the payer submits a wallet transaction id and an ADMIN
--                      approves or rejects it before anything is granted.
--
-- BOTH PATHS ARE DEMONSTRATIONS TODAY. `is_sandbox` is written from the
-- application's method catalogue, not hardcoded, so it is true for every row
-- this deployment writes and becomes false per-wallet the moment a real
-- merchant number is configured. Reporting must filter on it rather than
-- assume.
--
-- The manual path is modelled rather than integrated because bKash Tokenized
-- Checkout and the Nagad merchant API both need credentials issued after a
-- business KYC; without them the alternative is a screen that collects a
-- wallet PIN, which this codebase must never do. It also has a property the
-- automated path does not — a human decides before anything is granted.
--
-- THE ESCALATION THAT IS DELIBERATELY ABSENT
--
-- There is no INSERT policy for `pro_subscription` on `payments`, and no
-- policy of any kind on `subscriptions`. A subscription row is written ONLY by
-- the service role, from either the webhook handler or the admin decision
-- route. A signed-in user therefore cannot make themselves Pro, cannot set
-- their own entitlement length, and cannot approve their own transaction, no
-- matter what they send. `entitlement_days` and `amount_minor` come from a
-- server-side plan constant, never from the request body.
-- ============================================================================

-- ── payments: carry an individual payer, not only a company ───────────────
--
-- A student buying Pro has no company. `company_id` was NOT NULL because in
-- 0014 every payment belonged to one; that is no longer true.

alter table public.payments
  add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table public.payments
  alter column company_id drop not null;

create index if not exists payments_user_idx on public.payments (user_id);

comment on column public.payments.user_id is
  'The individual payer, for personal purchases (pro_subscription). NULL for '
  'company purchases, where company_id carries the payer instead.';

-- ── payments: what the payer chose, and how it settles ────────────────────

alter table public.payments
  add column if not exists method text not null default 'demo';

alter table public.payments
  add column if not exists settlement text not null default 'provider_webhook';

-- The transaction id the payer submits, and the number they sent from. Both
-- exist so a reviewer can match the row against a merchant statement in a
-- deployment that has one. Neither is a credential: a wallet TrxID is a
-- receipt number, useless to anyone who does not also hold the merchant
-- account. NOTHING HERE MAY EVER HOLD A PIN, an OTP or a card number.
alter table public.payments
  add column if not exists payer_reference text;

alter table public.payments
  add column if not exists payer_msisdn text;

comment on column public.payments.payer_reference is
  'Wallet transaction id supplied by the payer on the manual_review path. A '
  'receipt number, never a credential. Verified by an admin against the '
  'merchant statement before anything is granted.';

-- ── payments: the admin review trail ──────────────────────────────────────
--
-- NULL review_status means "this payment does not need a human" — the whole
-- provider_webhook path. Only manual_review rows carry one.

alter table public.payments
  add column if not exists review_status text;

alter table public.payments
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

alter table public.payments
  add column if not exists reviewed_at timestamptz;

alter table public.payments
  add column if not exists review_note text;

create index if not exists payments_review_idx
  on public.payments (created_at desc)
  where review_status = 'pending';

-- One wallet transaction settles one payment. Without this, the same TrxID
-- submitted twice creates two rows an admin might approve on two different
-- days, granting two periods for one transfer. The database refuses the
-- second submission instead of relying on the reviewer noticing.
create unique index if not exists payments_reference_unique
  on public.payments (method, payer_reference)
  where payer_reference is not null;

-- ── widen the 0014 CHECK constraints ──────────────────────────────────────
--
-- Dropped by DISCOVERY rather than by name. `check (provider in ('sandbox'))`
-- written inline gets a server-generated name, and a `drop constraint if
-- exists payments_provider_check` that guesses wrong fails SILENTLY — the old
-- constraint survives and every new insert is rejected at runtime instead of
-- here. Matching on the constraint's own definition cannot guess wrong.

do $mig$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'payments'
       and con.contype = 'c'
       and (
         pg_get_constraintdef(con.oid) like '%feature_listing%'
         or pg_get_constraintdef(con.oid) like '%sandbox%'
       )
  loop
    execute format('alter table public.payments drop constraint %I', c.conname);
  end loop;
end;
$mig$;

alter table public.payments
  add constraint payments_purpose_check
  check (purpose in ('feature_listing', 'pro_subscription'));

-- 'manual' is a provider in the same sense 'sandbox' is: it names who decided
-- the outcome. For a manual_review payment that is an admin, not an API.
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('sandbox', 'manual'));

alter table public.payments
  add constraint payments_method_check
  check (method in ('bkash', 'nagad', 'rocket', 'card', 'demo'));

alter table public.payments
  add constraint payments_settlement_check
  check (settlement in ('provider_webhook', 'manual_review'));

alter table public.payments
  add constraint payments_review_status_check
  check (review_status is null or review_status in ('pending', 'approved', 'rejected'));

-- A payment has exactly one payer. Without this, a row with neither set is
-- an orphan nobody can be shown, and a row with both is ambiguous about who
-- is entitled to what.
alter table public.payments
  add constraint payments_one_payer
  check (
    (purpose = 'feature_listing' and company_id is not null and user_id is null)
    or
    (purpose = 'pro_subscription' and user_id is not null and company_id is null)
  );

-- Every manual_review row must carry a review state, and no webhook row may.
-- This is what stops a manual payment from sitting in a queue nobody reads.
alter table public.payments
  add constraint payments_review_matches_settlement
  check (
    (settlement = 'manual_review' and review_status is not null)
    or
    (settlement = 'provider_webhook' and review_status is null)
  );

-- ── payments RLS: a personal payer sees their own rows ────────────────────
--
-- The INSERT policy is deliberately NOT widened. `pro_subscription` rows are
-- written by the service role in the checkout route, from a server-side plan
-- constant. If this policy allowed them, a client could choose its own
-- `amount_minor` and `entitlement_days` — buying a decade for one paisa is a
-- one-line curl, and no amount of UI care prevents it.

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    (select public.is_admin())
    or (company_id is not null and public.is_member_of_company(company_id))
    or user_id = (select auth.uid())
  );

-- ── subscriptions ─────────────────────────────────────────────────────────
--
-- One row per user, keyed by user_id rather than by an id of its own: "is this
-- person Pro right now" is a single question with a single answer, and a table
-- that can hold two live answers for one person will eventually hold two. The
-- history of what was bought lives in `payments`, which is append-only in
-- practice; renewals extend `current_period_end` here.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,

  plan text not null default 'pro' check (plan in ('pro')),

  -- 'active' is not the same as "inside the period": a canceled subscription
  -- runs to the end of what was paid for. Entitlement is
  -- (status <> 'expired') AND current_period_end > now(), computed in one
  -- place — see is_pro() below.
  status text not null default 'active'
    check (status in ('active', 'expired', 'canceled')),

  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,

  -- What paid for the current period. Kept for the audit trail: an admin
  -- asking "why is this person Pro" gets an answer that points at a payment.
  source_payment_id uuid references public.payments (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_period_idx
  on public.subscriptions (current_period_end);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

-- Read your own; an admin reads everyone's. There is NO insert, update or
-- delete policy, for anybody. That absence is the security property, not an
-- oversight: the only writers are the payments webhook and the admin decision
-- route, both of which run as the service role.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (
    user_id = (select auth.uid()) or (select public.is_admin())
  );

grant select on public.subscriptions to authenticated;
grant all privileges on public.subscriptions to service_role;
revoke all privileges on public.subscriptions from anon;

-- ── is_pro(): the single definition of entitlement ────────────────────────
--
-- Server code and RLS must agree on what "Pro" means. Two implementations of
-- an expiry rule drift, and the direction they drift in is someone keeping
-- access they stopped paying for.
--
-- STABLE, not IMMUTABLE: it reads a table and now().
--
-- ── WHY THE CALLER IS CHECKED INSIDE A FUNCTION THAT LOOKS LIKE A PREDICATE ──
--
-- SECURITY DEFINER plus a caller-supplied uuid is an information-disclosure
-- primitive: the function is reachable at /rest/v1/rpc/is_pro, so without the
-- guard below any signed-in user could pass someone else's id and learn
-- whether that person pays for anything. The other helpers in this schema
-- (is_admin, is_employer) take no argument and cannot be asked about a third
-- party, so this is the first one that needed it.
--
-- The parameter is kept rather than removed because a future RLS policy may
-- legitimately need `is_pro(some_row.user_id)` while running as the row's
-- owner or as an admin, and both of those still pass. Everyone else gets
-- FALSE — the same answer a stranger deserves, and indistinguishable from
-- "that person is not subscribed", which is the point.

create or replace function public.is_pro(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.subscriptions s
     where s.user_id = p_user
       and s.status <> 'expired'
       and s.current_period_end > now()
  )
  and (p_user = (select auth.uid()) or (select public.is_admin()));
$fn$;

comment on function public.is_pro(uuid) is
  'True while the user holds a paid period that has not ended. A canceled '
  'subscription stays true until the period they paid for runs out; only '
  'expired is immediately false.';

revoke execute on function public.is_pro(uuid) from public;
revoke execute on function public.is_pro(uuid) from anon;
grant execute on function public.is_pro(uuid) to authenticated;
grant execute on function public.is_pro(uuid) to service_role;
