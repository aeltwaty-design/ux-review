-- Roles. engineer (default): raises requests, edits/withdraws their own request while it is still "requested",
-- marks findings Solved / Won't fix / Needs design decision, writes notes, attaches screenshots.
-- ux: everything above plus start / deliver / close / reopen any review and add, edit, delete findings.
-- admin: everything plus managing people's roles and the apps list.
-- Roles can be pre-assigned by email (role_assignments) before a person signs in for the first time.

alter table public.profiles add column if not exists role text not null default 'engineer' check (role in ('engineer', 'ux', 'admin'));

create table if not exists public.role_assignments (
  email text primary key,
  role text not null check (role in ('engineer', 'ux', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'engineer')
$$;
create or replace function public.is_ux() returns boolean language sql stable as $$ select public.my_role() in ('ux', 'admin') $$;
create or replace function public.is_admin() returns boolean language sql stable as $$ select public.my_role() = 'admin' $$;

-- New sign-ups take the pre-assigned role for their email, else engineer. Existing roles are never overwritten here.
create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare assigned text;
begin
  select ra.role into assigned from public.role_assignments ra where lower(ra.email) = lower(new.email);
  insert into public.profiles (id, email, name, avatar_url, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(assigned, 'engineer'))
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, profiles.name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end $$;

-- ---------- profiles: admins edit anyone's role; nobody else can touch role; never remove the last admin
drop policy if exists "members update own profile" on public.profiles;
create policy "members update own profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create or replace function public.guard_profile_role() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an admin can change roles';
    end if;
    if old.role = 'admin' and new.role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Keep at least one admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role before update on public.profiles for each row execute function public.guard_profile_role();

-- ---------- reviews
drop policy if exists "members use reviews" on public.reviews;
drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews" on public.reviews for select to authenticated using (public.is_member());
drop policy if exists "members raise requests" on public.reviews;
create policy "members raise requests" on public.reviews for insert to authenticated
  with check (public.is_member() and requested_by = auth.uid() and status = 'requested');
drop policy if exists "ux update reviews" on public.reviews;
create policy "ux update reviews" on public.reviews for update to authenticated
  using (public.is_member() and public.is_ux()) with check (public.is_member() and public.is_ux());
drop policy if exists "engineers edit own open request" on public.reviews;
create policy "engineers edit own open request" on public.reviews for update to authenticated
  using (public.is_member() and requested_by = auth.uid() and status = 'requested')
  with check (requested_by = auth.uid() and status = 'requested');
drop policy if exists "ux delete reviews" on public.reviews;
create policy "ux delete reviews" on public.reviews for delete to authenticated using (public.is_member() and public.is_ux());
drop policy if exists "engineers withdraw own request" on public.reviews;
create policy "engineers withdraw own request" on public.reviews for delete to authenticated
  using (public.is_member() and requested_by = auth.uid() and status = 'requested');

-- ---------- findings: UX writes content; everyone may change state, note and screenshots
drop policy if exists "members use findings" on public.findings;
drop policy if exists "members read findings" on public.findings;
create policy "members read findings" on public.findings for select to authenticated using (public.is_member());
drop policy if exists "ux insert findings" on public.findings;
create policy "ux insert findings" on public.findings for insert to authenticated with check (public.is_member() and public.is_ux());
drop policy if exists "members update findings" on public.findings;
create policy "members update findings" on public.findings for update to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "ux delete findings" on public.findings;
create policy "ux delete findings" on public.findings for delete to authenticated using (public.is_member() and public.is_ux());

create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_ux() and (
       new.review_id is distinct from old.review_id or new.code is distinct from old.code or new.screen is distinct from old.screen
    or new.type is distinct from old.type or new.lang is distinct from old.lang or new.sev is distinct from old.sev
    or new.description is distinct from old.description or new.prod is distinct from old.prod or new.figma is distinct from old.figma
    or new.sort_order is distinct from old.sort_order or new.flow is distinct from old.flow or new.flow_group is distinct from old.flow_group
    or new.created_by is distinct from old.created_by or new.created_label is distinct from old.created_label or new.source is distinct from old.source)
  then
    raise exception 'Engineers can change a finding''s state, note and screenshots only';
  end if;
  return new;
end $$;
drop trigger if exists guard_finding_update on public.findings;
create trigger guard_finding_update before update on public.findings for each row execute function public.guard_finding_update();

-- ---------- role assignments and apps: admins only
alter table public.role_assignments enable row level security;
drop policy if exists "admins manage role assignments" on public.role_assignments;
create policy "admins manage role assignments" on public.role_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage apps" on public.apps;
create policy "admins manage apps" on public.apps for all to authenticated using (public.is_admin()) with check (public.is_admin());
