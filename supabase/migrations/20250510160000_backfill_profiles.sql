-- One-time backfill: create a public.profiles row for every auth.users without one.
-- The first such user (oldest auth.users.created_at) becomes admin if no admin exists yet.

with missing as (
  select u.id, u.email, u.raw_user_meta_data, u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
  order by u.created_at asc
), already_has_admin as (
  select exists(select 1 from public.profiles where role = 'admin') as v
)
insert into public.profiles (id, name, role)
select
  m.id,
  coalesce(m.raw_user_meta_data->>'name', split_part(m.email, '@', 1)),
  case
    when (select v from already_has_admin) = false
      and m.id = (select id from missing order by created_at asc limit 1)
      then 'admin'
    else 'sales'
  end
from missing m;
