-- Per-unit employee-facing price (sales reps see this, not internal price).

alter table public.plot_state
  add column if not exists employee_price numeric;

-- Only admins may insert or update plot_state (sales are read-only).
drop policy if exists "plot_state_insert_authenticated" on public.plot_state;
drop policy if exists "plot_state_update_authenticated" on public.plot_state;

create policy "plot_state_insert_admin"
  on public.plot_state for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "plot_state_update_admin"
  on public.plot_state for update
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

-- Non-admins cannot change internal or employee price on plot_state.
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
    if new.employee_price is distinct from old.employee_price then
      raise exception 'Only admins can change employee price';
    end if;
  end if;

  if tg_op = 'INSERT' and not is_admin then
    if new.price is not null or new.employee_price is not null then
      raise exception 'Only admins can set prices';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
