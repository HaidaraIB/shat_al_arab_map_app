-- Admin-only status: employee hold (حجز للموظف). Sales see these units as sold on the map.

alter table public.plot_state
  drop constraint if exists plot_state_status_check;

alter table public.plot_state
  add constraint plot_state_status_check
  check (status in ('available', 'reserved', 'sold', 'employee_reserved'));

alter table public.sales_log
  drop constraint if exists sales_log_action_check;

alter table public.sales_log
  add constraint sales_log_action_check
  check (action in ('reserved', 'sold', 'released', 'price_changed', 'employee_reserved'));

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
        when new.status = 'employee_reserved' then 'employee_reserved'
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
