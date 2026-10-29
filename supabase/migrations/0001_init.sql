-- WalaPlus UX Reviews — schema, access rules, storage and realtime.
-- Run once in Supabase → SQL editor (or `supabase db push`). Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ---------- people
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Only walaplus.com accounts may sign in: everything else is rejected before the user row exists.
create or replace function public.check_signup_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email, '')) not like '%@walaplus.com' then
    raise exception 'Only walaplus.com accounts can use UX Reviews';
  end if;
  return new;
end $$;
drop trigger if exists check_signup_domain on auth.users;
create trigger check_signup_domain before insert on auth.users
  for each row execute function public.check_signup_domain();

-- Keep a profile row (name, avatar) in sync with the auth user.
create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, profiles.name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end $$;
drop trigger if exists sync_profile_insert on auth.users;
create trigger sync_profile_insert after insert on auth.users
  for each row execute function public.sync_profile();
drop trigger if exists sync_profile_update on auth.users;
create trigger sync_profile_update after update of raw_user_meta_data, email on auth.users
  for each row execute function public.sync_profile();

-- ---------- reviews (one per request)
create table if not exists public.reviews (
  id text primary key,
  flow text not null,
  platform text not null default 'Android',
  build text not null default '',
  screens text not null default '',
  figma text not null default '',
  languages text[] not null default '{AR,EN}',
  reach text not null default '',
  story text not null default '',
  requested_by uuid references public.profiles(id) on delete set null,
  requester_label text,
  reviewer uuid references public.profiles(id) on delete set null,
  reviewer_label text,
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'delivered', 'done')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  page text,
  source text not null default 'board',
  slack jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- findings (many per review)
create table if not exists public.findings (
  id text primary key,                       -- '<review id>.<code>'
  review_id text not null references public.reviews(id) on delete cascade,
  code text not null,
  flow_group text not null default '',
  flow text not null default '',
  screen text not null default '',
  type text not null default 'Other',
  lang text not null default 'Both',
  sev smallint not null default 2 check (sev between 1 and 3),
  description text not null default '',
  prod text not null default '',
  figma text not null default '',
  state text not null default 'open' check (state in ('open', 'solved', 'wontfix', 'design')),
  state_by uuid references public.profiles(id) on delete set null,
  state_label text,
  state_at timestamptz,
  note text not null default '',
  note_by uuid references public.profiles(id) on delete set null,
  note_label text,
  note_at timestamptz,
  images jsonb not null default '[]'::jsonb,  -- [{path, name, by, at}] in the screenshots bucket
  created_by uuid references public.profiles(id) on delete set null,
  created_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sort_order integer not null default 0,
  source text not null default 'board'
);
create index if not exists findings_review_idx on public.findings (review_id);
create index if not exists findings_state_idx on public.findings (state);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews for each row execute function public.touch_updated_at();
drop trigger if exists findings_touch on public.findings;
create trigger findings_touch before update on public.findings for each row execute function public.touch_updated_at();

-- ---------- access: every signed-in walaplus.com member can read and write the board
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.findings enable row level security;

create or replace function public.is_member() returns boolean
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@walaplus.com'
$$;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());
drop policy if exists "members update own profile" on public.profiles;
create policy "members update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members use reviews" on public.reviews;
create policy "members use reviews" on public.reviews for all to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "members use findings" on public.findings;
create policy "members use findings" on public.findings for all to authenticated using (public.is_member()) with check (public.is_member());

-- ---------- realtime: the board updates live for everyone who has it open
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reviews') then
    alter publication supabase_realtime add table public.reviews;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'findings') then
    alter publication supabase_realtime add table public.findings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
alter table public.reviews replica identity full;
alter table public.findings replica identity full;

-- ---------- storage: masked screenshots, private bucket, members read, uploader deletes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "members read screenshots" on storage.objects;
create policy "members read screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and public.is_member());
drop policy if exists "members upload screenshots" on storage.objects;
create policy "members upload screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and public.is_member());
drop policy if exists "uploader deletes screenshots" on storage.objects;
create policy "uploader deletes screenshots" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and owner = auth.uid());
