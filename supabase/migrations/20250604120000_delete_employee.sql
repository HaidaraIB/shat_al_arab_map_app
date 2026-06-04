-- Admin-only employee deletion (removes auth.users; profiles cascade).

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

  update public.maps set updated_by = null where updated_by = target_id;
  update public.plot_state set updated_by = null where updated_by = target_id;
  update public.sales_log set actor_id = null where actor_id = target_id;

  delete from auth.users where id = target_id;
end;
$$;

revoke all on function public.delete_employee(uuid) from public;
grant execute on function public.delete_employee(uuid) to authenticated;
