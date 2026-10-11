create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  debit_balance numeric(12, 2) not null default 0,
  credit_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.app_profiles enable row level security;

grant select, insert, update on public.app_profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.app_profiles;
create policy "Users can read their own profile"
  on public.app_profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can create their own profile" on public.app_profiles;
create policy "Users can create their own profile"
  on public.app_profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.app_profiles;
create policy "Users can update their own profile"
  on public.app_profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
