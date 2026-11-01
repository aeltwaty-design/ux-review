-- Roles simplified to Viewer / Editor / Admin. The team says who someone is; the role says what they may do.
--   admin   raises and runs reviews (reviewer), routes findings, closes, manages People — everything.
--   editor  the former collaborator: sees every finding owned by their team (and any assigned to them), takes or
--           releases, changes state / note / screenshots.
--   viewer  the same view as an editor, read-only.
--   pending waiting admin approval: review links only.
-- The UX team role becomes admin (only admins run reviews); product owners become editors (product scoping is dropped).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'viewer', 'editor', 'admin', 'collaborator', 'ux', 'product_owner'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('viewer', 'editor', 'admin', 'collaborator', 'ux', 'product_owner'));
update public.profiles set role = case role when 'ux' then 'admin' else 'editor' end where role in ('collaborator', 'product_owner', 'ux');
update public.role_assignments set role = case role when 'ux' then 'admin' else 'editor' end where role in ('collaborator', 'product_owner', 'ux');
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'viewer', 'editor', 'admin'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('viewer', 'editor', 'admin'));

create or replace function public.is_editor() returns boolean language sql stable as $$ select public.my_role() = 'editor' $$;

-- ---------- sign-up and approval (no products any more)
create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare assigned text; assigned_team text;
begin
  select ra.role, ra.team_id into assigned, assigned_team from public.role_assignments ra where lower(ra.email) = lower(new.email) and ra.approved;
  insert into public.profiles (id, email, name, avatar_url, role, team_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(assigned, 'pending'), assigned_team)
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, profiles.name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end $$;

create or replace function public.apply_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.approved then return new; end if;
  update public.profiles set role = new.role, team_id = coalesce(new.team_id, team_id) where lower(email) = new.email and role = 'pending';
  return new;
end $$;

-- ---------- reviews: admins run everything; editors and viewers read the reviews that hold their team's findings
drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews" on public.reviews for select to authenticated
  using (public.is_member() and (public.is_admin() or public.assigned_in_review(id)));
drop policy if exists "ux raise requests" on public.reviews;
drop policy if exists "admins raise requests" on public.reviews;
create policy "admins raise requests" on public.reviews for insert to authenticated
  with check (public.is_member() and public.is_admin() and requested_by = auth.uid() and status = 'requested');
drop policy if exists "ux update reviews" on public.reviews;
drop policy if exists "owners update reviews" on public.reviews;
drop policy if exists "admins update reviews" on public.reviews;
create policy "admins update reviews" on public.reviews for update to authenticated
  using (public.is_member() and public.is_admin()) with check (public.is_member() and public.is_admin());
-- "admins delete reviews" stays.

create or replace function public.guard_review_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  raise exception 'Only an admin can change a review';
end $$;

-- ---------- findings: admins write content and route; editors work their team's findings; viewers read
drop policy if exists "members read findings" on public.findings;
create policy "members read findings" on public.findings for select to authenticated
  using (public.is_member() and (public.is_admin() or assignee = auth.uid() or (team_id is not null and team_id = public.my_team())));
drop policy if exists "ux insert findings" on public.findings;
drop policy if exists "admins insert findings" on public.findings;
create policy "admins insert findings" on public.findings for insert to authenticated with check (public.is_member() and public.is_admin());
drop policy if exists "members update findings" on public.findings;
create policy "members update findings" on public.findings for update to authenticated
  using (public.is_member() and (public.is_admin() or (public.is_editor() and public.works_finding(id))))
  with check (public.is_member() and (public.is_admin() or (public.is_editor() and public.works_finding(id))));
drop policy if exists "ux delete findings" on public.findings;
drop policy if exists "admins delete findings" on public.findings;
create policy "admins delete findings" on public.findings for delete to authenticated using (public.is_member() and public.is_admin());

create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if not public.is_editor() then raise exception 'Viewers cannot change findings'; end if;
  if (   new.review_id is distinct from old.review_id or new.code is distinct from old.code or new.screen is distinct from old.screen
      or new.type is distinct from old.type or new.lang is distinct from old.lang or new.sev is distinct from old.sev
      or new.description is distinct from old.description or new.prod is distinct from old.prod or new.figma is distinct from old.figma
      or new.sort_order is distinct from old.sort_order or new.flow is distinct from old.flow or new.flow_group is distinct from old.flow_group
      or new.created_by is distinct from old.created_by or new.created_label is distinct from old.created_label or new.source is distinct from old.source)
  then
    raise exception 'Only an admin can change a finding''s content';
  end if;
  if new.team_id is distinct from old.team_id then
    raise exception 'Only an admin can move a finding to another team';
  end if;
  if new.assignee is distinct from old.assignee then
    -- take an unassigned finding of my team, or release my own
    if not ((old.assignee is null and new.assignee = auth.uid() and old.team_id is not null and old.team_id = public.my_team())
            or (old.assignee = auth.uid() and new.assignee is null)) then
      raise exception 'Only an admin can assign a finding to someone else';
    end if;
  end if;
  return new;
end $$;

-- ---------- screenshots: admins and editors of the team upload; reads stay open to the domain (links); uploader deletes
drop policy if exists "members upload screenshots" on storage.objects;
create policy "members upload screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and public.is_member()
              and (public.is_admin() or (public.is_editor() and public.assigned_in_review(split_part(name, '/', 1)))));

-- ---------- retire product scoping and the old role helpers
drop table if exists public.profile_apps;
alter table public.role_assignments drop column if exists apps;
drop function if exists public.is_reviewer_of(text);
drop function if exists public.owns_review(text);
drop function if exists public.owns_app(text);
drop function if exists public.is_po();
drop function if exists public.is_ux();
