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

create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('debit', 'credit', 'savings', 'investment', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  signed_balance numeric(12, 2) not null,
  balance_direction text not null default 'positive',
  created_at timestamptz not null default now()
);

alter table public.app_accounts
  add column if not exists balance_direction text default 'positive';

update public.app_accounts
set balance_direction = case when signed_balance < 0 then 'negative' else 'positive' end
where balance_direction is null
   or balance_direction <> case when signed_balance < 0 then 'negative' else 'positive' end;

update public.app_accounts
set account_type = 'investment'
where account_type = 'savings';

alter table public.app_accounts
  alter column balance_direction set default 'positive',
  alter column balance_direction set not null;

alter table public.app_accounts
  drop constraint if exists app_accounts_balance_direction_check;

alter table public.app_accounts
  add constraint app_accounts_balance_direction_check
  check (
    (balance_direction = 'positive' and signed_balance >= 0)
    or (balance_direction = 'negative' and signed_balance < 0)
  );

insert into public.app_accounts (user_id, account_type, name, signed_balance, balance_direction)
select p.id, 'debit', 'Débit', p.debit_balance,
       case when p.debit_balance < 0 then 'negative' else 'positive' end
from public.app_profiles p
where not exists (
  select 1 from public.app_accounts a
  where a.user_id = p.id and a.account_type = 'debit' and a.name = 'Débit'
);

insert into public.app_accounts (user_id, account_type, name, signed_balance, balance_direction)
select p.id, 'credit', 'Crédit', -p.credit_balance,
       case when -p.credit_balance < 0 then 'negative' else 'positive' end
from public.app_profiles p
where not exists (
  select 1 from public.app_accounts a
  where a.user_id = p.id and a.account_type = 'credit' and a.name = 'Crédit'
);

alter table public.app_accounts enable row level security;

grant select, insert, delete on public.app_accounts to authenticated;
grant update (name) on public.app_accounts to authenticated;

drop policy if exists "Users can read their own accounts" on public.app_accounts;
create policy "Users can read their own accounts"
  on public.app_accounts for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own accounts" on public.app_accounts;
create policy "Users can create their own accounts"
  on public.app_accounts for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own accounts" on public.app_accounts;
create policy "Users can delete their own accounts"
  on public.app_accounts for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can rename their own accounts" on public.app_accounts;
create policy "Users can rename their own accounts"
  on public.app_accounts for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.create_initial_profile(
  p_first_name text,
  p_last_name text,
  p_debit_balance numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_first_name is null
     or p_last_name is null
     or char_length(btrim(p_first_name)) not between 1 and 80
     or char_length(btrim(p_last_name)) not between 1 and 80 then
    raise exception 'First and last name must contain between 1 and 80 characters';
  end if;

  if p_debit_balance is null
     or abs(p_debit_balance) > 9999999999.99
     or p_debit_balance <> round(p_debit_balance, 2) then
    raise exception 'Invalid debit balance';
  end if;

  if exists (select 1 from public.app_profiles where id = current_user_id) then
    raise exception 'Profile already exists';
  end if;

  insert into public.app_profiles (id, first_name, last_name, debit_balance, credit_balance)
  values (current_user_id, btrim(p_first_name), btrim(p_last_name), p_debit_balance, 0);

  insert into public.app_accounts (user_id, account_type, name, signed_balance, balance_direction)
  values (
    current_user_id,
    'debit',
    'Débit',
    p_debit_balance,
    case when p_debit_balance < 0 then 'negative' else 'positive' end
  );
end;
$$;

revoke all on function public.create_initial_profile(text, text, numeric) from public, anon;
grant execute on function public.create_initial_profile(text, text, numeric) to authenticated;
