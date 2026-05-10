-- Shat Al Arab map app — initial schema (run in your cloud backend SQL editor or via supabase db push)

-- Make sure anon/authenticated roles can reach the public schema (cloud backend default,
-- explicit here for projects where this got dropped).
grant usage on schema public to anon, authenticated;

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role text not null default 'sales' check (role in ('admin', 'sales')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Map design document (geometry, labels, etc.) — dynamic plot state lives in plot_state
create table if not exists public.maps (
  id text primary key default 'default',
  name text not null default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table public.maps enable row level security;

create policy "maps_select_authenticated"
  on public.maps for select
  to authenticated
  using (true);

create policy "maps_insert_admin"
  on public.maps for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "maps_update_admin"
  on public.maps for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "maps_delete_admin"
  on public.maps for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Per-plot sales / booking state (Realtime target)
create table if not exists public.plot_state (
  plot_id text primary key,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  price numeric,
  customer_name text,
  note text,
  reserved_at timestamptz,
  reserved_until timestamptz,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table public.plot_state enable row level security;

create policy "plot_state_select_authenticated"
  on public.plot_state for select
  to authenticated
  using (true);

create policy "plot_state_insert_authenticated"
  on public.plot_state for insert
  to authenticated
  with check (true);

create policy "plot_state_update_authenticated"
  on public.plot_state for update
  to authenticated
  using (true)
  with check (true);

create policy "plot_state_delete_admin"
  on public.plot_state for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Audit log (inserted only via trigger; no direct client inserts)
create table if not exists public.sales_log (
  id uuid primary key default gen_random_uuid(),
  plot_id text not null,
  actor_id uuid references auth.users (id),
  action text not null check (action in ('reserved', 'sold', 'released', 'price_changed')),
  from_status text,
  to_status text,
  customer_name text,
  price numeric,
  created_at timestamptz not null default now()
);

create index if not exists sales_log_plot_id_idx on public.sales_log (plot_id);
create index if not exists sales_log_created_at_idx on public.sales_log (created_at desc);

alter table public.sales_log enable row level security;

create policy "sales_log_select_authenticated"
  on public.sales_log for select
  to authenticated
  using (true);

-- First signup becomes admin; subsequent users are sales
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case
      when (select count(*)::int from public.profiles) = 0 then 'admin'
      else 'sales'
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins cannot change price on plot_state
create or replace function public.enforce_plot_state_price_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) into is_admin;

  if tg_op = 'UPDATE' and not is_admin then
    if new.price is distinct from old.price then
      raise exception 'Only admins can change price';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists plot_state_touch on public.plot_state;
create trigger plot_state_touch
  before insert or update on public.plot_state
  for each row execute function public.enforce_plot_state_price_role();

-- Sales audit log
create or replace function public.log_plot_state_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
begin
  if tg_op = 'INSERT' then
    if new.status in ('reserved', 'sold') then
      act := case when new.status = 'sold' then 'sold' else 'reserved' end;
      insert into public.sales_log (plot_id, actor_id, action, from_status, to_status, customer_name, price)
      values (new.plot_id, auth.uid(), act, null, new.status, new.customer_name, new.price);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      act := case
        when new.status = 'sold' then 'sold'
        when new.status = 'reserved' then 'reserved'
        else 'released'
      end;
      insert into public.sales_log (plot_id, actor_id, action, from_status, to_status, customer_name, price)
      values (new.plot_id, auth.uid(), act, old.status, new.status, new.customer_name, new.price);
    end if;
    if old.price is distinct from new.price then
      insert into public.sales_log (plot_id, actor_id, action, from_status, to_status, customer_name, price)
      values (
        new.plot_id,
        auth.uid(),
        'price_changed',
        old.status,
        new.status,
        new.customer_name,
        new.price
      );
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists plot_state_audit on public.plot_state;
create trigger plot_state_audit
  after insert or update on public.plot_state
  for each row execute function public.log_plot_state_activity();

-- Table-level grants. RLS still enforced on top.
grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.maps        to authenticated;
grant select, insert, update, delete on public.plot_state  to authenticated;
grant select                          on public.sales_log  to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- Realtime (ignore errors if already added)
do $$
begin
  alter publication supabase_realtime add table public.plot_state;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.sales_log;
exception
  when duplicate_object then null;
end;
$$;
