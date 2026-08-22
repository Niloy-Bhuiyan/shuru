-- ════════════════════════════════════════════════════════════════
-- 0010 — Web Push subscriptions
--
-- A push subscription is issued by the BROWSER's push service, not by us. It
-- is per-device and per-browser, so one user legitimately has several, and a
-- subscription can expire or be revoked at any time without telling us —
-- delivery discovers it via a 404/410 from the push service.
--
-- The endpoint URL is the address the push service delivers to; the two keys
-- are the client's public key and auth secret, used to encrypt the payload so
-- the push service itself cannot read it. All three are opaque handles, not
-- credentials of ours.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- the push service URL; unique per device+browser
  endpoint text not null,
  -- client public key (p256dh) and auth secret, base64url
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  -- stamped on each successful send, so dormant devices are identifiable
  last_used_at timestamptz,
  -- set when the push service reports the subscription is gone (404/410).
  -- Kept rather than deleted so a device that unsubscribes is distinguishable
  -- from one that never subscribed.
  expired_at timestamptz
);

-- One row per device: re-subscribing the same browser updates in place.
create unique index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id)
  where expired_at is null;

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table public.push_subscriptions enable row level security;

-- A user manages only their own devices. The service role bypasses RLS and is
-- what actually sends, so no broader policy is needed.
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 0007's default privileges already grant authenticated DML on new tables in
-- this schema; stated explicitly so the intent survives a default change.
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all privileges on public.push_subscriptions to service_role;

-- `expired_at` is delivery bookkeeping, not something a client should forge.
-- A client may create and delete its own subscriptions; only the sender
-- (service role) marks one dead.
create or replace function public.guard_push_subscription_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_service_role() or public.is_admin() then
    return new;
  end if;
  new.expired_at := old.expired_at;
  new.last_used_at := old.last_used_at;
  return new;
end;
$fn$;

drop trigger if exists push_subscriptions_guard_update on public.push_subscriptions;
create trigger push_subscriptions_guard_update
  before update on public.push_subscriptions
  for each row execute function public.guard_push_subscription_update();

-- Trigger functions are not RPCs (see 0009).
revoke execute on function public.guard_push_subscription_update() from public;
revoke execute on function public.guard_push_subscription_update() from anon;
revoke execute on function public.guard_push_subscription_update() from authenticated;
