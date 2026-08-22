-- ════════════════════════════════════════════════════════════════
-- 0002 — Roles, companies, employer membership
-- Adds the authorization foundation the rest of the system builds on.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── role enum ───────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('student', 'employer', 'admin');
exception when duplicate_object then null;
end $$;

-- ── user_roles ──────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── role helpers ────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies can call them without recursing into
-- user_roles' own policies. Named current_user_role() because both
-- `current_role` and `current_user` are reserved words in Postgres.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid()),
    'student'::public.user_role
  );
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$fn$;

create or replace function public.is_employer()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('employer', 'admin')
  );
$fn$;

-- Requests made with the service_role key have no auth.uid(), so is_admin()
-- is false for them. Trusted server-side work (ingestion, scheduled jobs)
-- must still pass the guard triggers below, which run even though the
-- service key bypasses RLS. auth.role() reads the JWT claim from a session
-- GUC, so it stays accurate inside SECURITY DEFINER functions.
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $fn$
  select coalesce(auth.role(), '') = 'service_role';
$fn$;

-- ── every new auth user gets a student role row ─────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill any pre-existing users
insert into public.user_roles (user_id, role)
select id, 'student'::public.user_role from auth.users
on conflict (user_id) do nothing;

-- ── companies ───────────────────────────────────────────────────
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  website text,
  logo_url text,
  description text,
  industry text,
  size_label text,
  location text,
  -- admin review of the company itself, separate from listing review
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected')),
  verification_notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_status_idx
  on public.companies (verification_status);

-- ── employer_members ────────────────────────────────────────────
-- A company can have several employer users; a user can belong to several
-- companies. is_owner marks who may manage membership.
create table if not exists public.employer_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  title text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index if not exists employer_members_company_idx
  on public.employer_members (company_id);

create or replace function public.is_member_of_company(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.employer_members
    where user_id = auth.uid() and company_id = target
  );
$fn$;

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table public.user_roles enable row level security;
alter table public.companies enable row level security;
alter table public.employer_members enable row level security;

-- user_roles: a user reads their own role; only admins read or change any.
-- No self-insert/update policy exists, so a student cannot promote themselves;
-- role rows are created by the signup trigger or changed by an admin.
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- companies: approved companies are readable by signed-in users; members and
-- admins see their own regardless of review state.
drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies
  for select using (
    verification_status = 'approved'
    or public.is_admin()
    or public.is_member_of_company(id)
  );

drop policy if exists "companies_insert_employer" on public.companies;
create policy "companies_insert_employer" on public.companies
  for insert with check (public.is_employer() and created_by = auth.uid());

-- Members may edit their company, but the verification columns are admin-only.
-- RLS cannot restrict individual columns, so the guard trigger below reverts
-- any non-admin attempt to change them.
drop policy if exists "companies_update_member" on public.companies;
create policy "companies_update_member" on public.companies
  for update using (public.is_member_of_company(id) or public.is_admin());

drop policy if exists "companies_delete_admin" on public.companies;
create policy "companies_delete_admin" on public.companies
  for delete using (public.is_admin());

create or replace function public.guard_company_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_admin() or public.is_service_role() then
    return new;
  end if;
  new.verification_status := old.verification_status;
  new.verification_notes  := old.verification_notes;
  new.reviewed_by         := old.reviewed_by;
  new.reviewed_at         := old.reviewed_at;
  return new;
end;
$fn$;

drop trigger if exists companies_guard_verification on public.companies;
create trigger companies_guard_verification
  before update on public.companies
  for each row execute function public.guard_company_verification();

-- employer_members: visible to fellow members and admins; owners manage.
drop policy if exists "employer_members_select" on public.employer_members;
create policy "employer_members_select" on public.employer_members
  for select using (
    user_id = auth.uid()
    or public.is_member_of_company(company_id)
    or public.is_admin()
  );

drop policy if exists "employer_members_insert" on public.employer_members;
create policy "employer_members_insert" on public.employer_members
  for insert with check (
    public.is_admin()
    or (public.is_employer() and (
      -- claiming the company you just created …
      user_id = auth.uid()
      -- … or an owner adding a colleague
      or exists (
        select 1 from public.employer_members m
        where m.company_id = employer_members.company_id
          and m.user_id = auth.uid()
          and m.is_owner
      )
    ))
  );

drop policy if exists "employer_members_delete" on public.employer_members;
create policy "employer_members_delete" on public.employer_members
  for delete using (
    public.is_admin()
    or exists (
      select 1 from public.employer_members m
      where m.company_id = employer_members.company_id
        and m.user_id = auth.uid()
        and m.is_owner
    )
  );
