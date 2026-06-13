-- Scope sales_log rows per map (matches plot_state.map_id).

alter table public.sales_log
  add column if not exists map_id text not null default 'default';

create index if not exists sales_log_map_id_idx on public.sales_log (map_id);
create index if not exists sales_log_map_created_at_idx on public.sales_log (map_id, created_at desc);

-- Audit trigger: include map_id from plot_state.
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
    if new.status in ('reserved', 'sold', 'employee_reserved') then
      act := case
        when new.status = 'sold' then 'sold'
        when new.status = 'employee_reserved' then 'employee_reserved'
        else 'reserved'
      end;
      insert into public.sales_log (map_id, plot_id, actor_id, action, from_status, to_status, customer_name, price)
      values (new.map_id, new.plot_id, auth.uid(), act, null, new.status, new.customer_name, new.price);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      act := case
        when new.status = 'sold' then 'sold'
        when new.status = 'reserved' then 'reserved'
        when new.status = 'employee_reserved' then 'employee_reserved'
        else 'released'
      end;
      insert into public.sales_log (map_id, plot_id, actor_id, action, from_status, to_status, customer_name, price)
      values (new.map_id, new.plot_id, auth.uid(), act, old.status, new.status, new.customer_name, new.price);
    end if;
    if old.price is distinct from new.price then
      insert into public.sales_log (map_id, plot_id, actor_id, action, from_status, to_status, customer_name, price)
      values (
        new.map_id,
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

notify pgrst, 'reload schema';
