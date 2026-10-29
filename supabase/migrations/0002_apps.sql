-- Apps: the board covers several products (WalaPlus, WalaOne, Doam, ...). Add rows here to add an app; no deploy needed.
create table if not exists public.apps (
  id text primary key,            -- short slug used in reviews.app_id
  name text not null,
  sort_order integer not null default 0
);
insert into public.apps (id, name, sort_order) values
  ('walaplus', 'WalaPlus', 1),
  ('walaone', 'WalaOne', 2),
  ('doam', 'Doam', 3)
on conflict (id) do nothing;

alter table public.reviews add column if not exists app_id text not null default 'walaplus' references public.apps(id);
create index if not exists reviews_app_idx on public.reviews (app_id);

alter table public.apps enable row level security;
drop policy if exists "members read apps" on public.apps;
create policy "members read apps" on public.apps for select to authenticated using (public.is_member());
