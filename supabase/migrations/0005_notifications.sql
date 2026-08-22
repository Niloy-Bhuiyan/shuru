-- ════════════════════════════════════════════════════════════════
-- 0005 — Notifications
--
-- Notifications are rows, not pushes. Creation is decoupled from
-- delivery: the in-app centre reads this table directly, while browser
-- and email delivery are recorded per channel when those senders are
-- enabled. Nothing here claims a message was delivered by a channel that
-- has not actually run.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  -- opportunity_id / application_id / company_id, plus any type-specific
  -- payload the UI needs to deep-link
  data jsonb not null default '{}'::jsonb,
  -- 0–100, computed from match quality × deadline proximity × freshness.
  -- Used to rank the centre and to decide what is worth sending onward.
  priority int not null default 50 check (priority between 0 and 100),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- alerts about a listing stop mattering once it closes
  expires_at timestamptz,
  -- per-channel delivery record; in-app is implicit (the row itself)
  emailed_at timestamptz,
  pushed_at timestamptz,
  -- deduplication handle: one alert per (user, type, subject)
  dedupe_key text
);

do $$ begin
  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'new_match',
      'urgent_internship',
      'saved_closing_soon',
      'application_viewed',
      'application_shortlisted',
      'application_interview',
      'application_rejected',
      'application_accepted',
      'application_update',
      'listing_status',
      'company_status'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id, priority desc, created_at desc)
  where read_at is null;
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- ── preferences ─────────────────────────────────────────────────
-- Prioritisation needs a floor the user controls, otherwise "relevant
-- alerts" degrades into volume.
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default false,
  browser_push boolean not null default false,
  -- suppress internship alerts below this match quality
  min_match_score int not null default 60 check (min_match_score between 0 and 100),
  -- hard cap on internship alerts per day, independent of ranking
  max_alerts_per_day int not null default 5 check (max_alerts_per_day between 0 and 50),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_touch on public.notification_preferences;
create trigger notification_preferences_touch
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- Recipients read their own notifications and mark them read. There is no
-- insert policy: notifications are created server-side (service role) or by
-- triggers, so no client can fabricate an alert for another user.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id or public.is_admin());

-- A recipient may only flip read state, never rewrite the message.
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_admin() or public.is_service_role() then
    return new;
  end if;
  new.type       := old.type;
  new.title      := old.title;
  new.body       := old.body;
  new.data       := old.data;
  new.priority   := old.priority;
  new.created_at := old.created_at;
  new.emailed_at := old.emailed_at;
  new.pushed_at  := old.pushed_at;
  return new;
end;
$fn$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.guard_notification_update();

drop policy if exists "notification_preferences_own" on public.notification_preferences;
create policy "notification_preferences_own" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── application status changes notify the applicant ─────────────
-- Wired in the database so an employer action always reaches the student,
-- regardless of which code path made the change.
create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n_type text;
  n_title text;
  role_text text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select o.role into role_text
  from public.opportunities o where o.id = new.opportunity_id;

  case new.status
    when 'viewed'      then n_type := 'application_viewed';
                            n_title := 'Your application was viewed';
    when 'shortlisted' then n_type := 'application_shortlisted';
                            n_title := 'You were shortlisted';
    when 'interview'   then n_type := 'application_interview';
                            n_title := 'Interview invitation';
    when 'accepted'    then n_type := 'application_accepted';
                            n_title := 'You were accepted';
    when 'rejected'    then n_type := 'application_rejected';
                            n_title := 'Application closed';
    else return new;
  end case;

  insert into public.notifications
    (user_id, type, title, body, priority, data)
  values (
    new.user_id,
    n_type,
    n_title,
    role_text,
    case when new.status in ('interview', 'accepted') then 95 else 80 end,
    jsonb_build_object(
      'application_id', new.id,
      'opportunity_id', new.opportunity_id,
      'status', new.status
    )
  );
  return new;
end;
$fn$;

drop trigger if exists applications_notify_status on public.applications;
create trigger applications_notify_status
  after update on public.applications
  for each row execute function public.notify_application_status();
