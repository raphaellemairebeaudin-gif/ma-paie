-- Ma paie : tables + sécurité (à coller dans Supabase > SQL Editor, puis « Run »)
-- Chaque ligne appartient à un utilisateur. Les règles (RLS) font en sorte
-- que chaque personne ne voit et ne modifie que ses propres données.

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  base    numeric(12,2) not null default 0,
  payday  smallint      not null default 5 check (payday between 1 and 7)
);

create table if not exists public.fixed_expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  amount     numeric(12,2) not null check (amount >= 0),
  day        smallint not null check (day between 1 and 31),
  created_at timestamptz not null default now()
);

create table if not exists public.weeks (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  pay        numeric(12,2),
  primary key (user_id, week_start)
);

create table if not exists public.spends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  spent_on   date not null,
  amount     numeric(12,2) not null check (amount > 0),
  cat        text not null,
  label      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists spends_user_week_idx on public.spends (user_id, week_start);

create table if not exists public.savings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  balance    numeric(12,2),
  created_at timestamptz not null default now()
);

-- Sécurité : seul le propriétaire d'une ligne peut la lire ou la modifier
alter table public.settings       enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.weeks          enable row level security;
alter table public.spends         enable row level security;
alter table public.savings        enable row level security;

drop policy if exists "settings_own"       on public.settings;
drop policy if exists "fixed_expenses_own" on public.fixed_expenses;
drop policy if exists "weeks_own"          on public.weeks;
drop policy if exists "spends_own"         on public.spends;
drop policy if exists "savings_own"        on public.savings;

create policy "settings_own"       on public.settings       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "fixed_expenses_own" on public.fixed_expenses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "weeks_own"          on public.weeks          for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "spends_own"         on public.spends         for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "savings_own"        on public.savings        for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
