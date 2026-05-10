-- Grant table access to anon / authenticated roles. RLS still applies on top.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.maps        to authenticated;
grant select, insert, update, delete on public.plot_state  to authenticated;
grant select                          on public.sales_log  to authenticated;

-- Future-proof: any new tables/sequences/functions created in `public` after this
-- will be readable/writable by authenticated by default (cloud backend normally sets this,
-- but some projects are missing it).
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

alter default privileges in schema public
  grant execute on functions to authenticated;
