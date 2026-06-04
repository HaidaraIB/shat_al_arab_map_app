-- Allow employee deletion when they appear in plot_state / maps / sales_log.

alter table public.maps
  drop constraint if exists maps_updated_by_fkey;

alter table public.maps
  add constraint maps_updated_by_fkey
  foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.plot_state
  drop constraint if exists plot_state_updated_by_fkey;

alter table public.plot_state
  add constraint plot_state_updated_by_fkey
  foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.sales_log
  drop constraint if exists sales_log_actor_id_fkey;

alter table public.sales_log
  add constraint sales_log_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete set null;

create or replace function public.delete_employee(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  admin_count int;
begin
  if target_id is null then
    raise exception 'معرّف المستخدم مطلوب';
  end if;

  if target_id = auth.uid() then
    raise exception 'لا يمكنك حذف حسابك الحالي';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'غير مصرح لك بحذف الموظفين';
  end if;

  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'الموظف غير موجود';
  end if;

  select count(*)::int into admin_count
  from public.profiles
  where role = 'admin';

  if exists (select 1 from public.profiles where id = target_id and role = 'admin')
     and admin_count <= 1 then
    raise exception 'لا يمكن حذف المدير الوحيد في النظام';
  end if;

  -- Clear references before delete (covers DBs that still use RESTRICT FKs).
  update public.maps set updated_by = null where updated_by = target_id;
  update public.plot_state set updated_by = null where updated_by = target_id;
  update public.sales_log set actor_id = null where actor_id = target_id;

  delete from auth.users where id = target_id;
end;
$$;

revoke all on function public.delete_employee(uuid) from public;
grant execute on function public.delete_employee(uuid) to authenticated;
