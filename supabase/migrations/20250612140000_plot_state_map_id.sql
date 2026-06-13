-- Scope plot_state rows per map (Zone I = default, Zone III = zone3).

alter table public.plot_state
  add column if not exists map_id text not null default 'default';

alter table public.plot_state drop constraint if exists plot_state_pkey;
alter table public.plot_state add primary key (map_id, plot_id);

create index if not exists plot_state_map_id_idx on public.plot_state (map_id);

insert into public.maps (id, name, data)
values (
  'zone3',
  'zone3',
  '{"meta":{"name":"Shatt Al-Arab — Zone III","width":1600,"height":1100,"version":1},"plots":[],"roads":[],"blocks":[],"facilities":[],"labels":[]}'::jsonb
)
on conflict (id) do nothing;

-- Refresh PostgREST schema cache so map_id is visible to the REST API immediately.
notify pgrst, 'reload schema';
