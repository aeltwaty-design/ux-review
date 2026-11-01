-- Teams. Findings are owned by a team (Engineering, Data, Marketing, …) and optionally assigned to a person in it.
-- The "engineer" role becomes "collaborator": someone who works the findings of their team. A collaborator sees every
-- finding owned by their team (plus any assigned to them personally), can take an unassigned one, and changes
-- state / note / screenshots. Reviewer, admin and product owners route findings to teams and people.

create table if not exists public.teams (
  id text primary key,
  name text not null,
  sort_order int not null default 0
);
insert into public.teams (id, name, sort_order) values
  ('engineering', 'Engineering', 1), ('data', 'Data', 2), ('marketing', 'Marketing', 3), ('marketplace', 'Marketplace', 4),
  ('customer_support', 'Customer support', 5), ('customer_success', 'Customer success', 6), ('business', 'Business', 7),
  ('management', 'Management', 8), ('design', 'Design', 9)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
alter table public.teams enable row level security;
drop policy if exists "members read teams" on public.teams;
create policy "members read teams" on public.teams for select to authenticated using (public.is_domain_user());
drop policy if exists "admins manage teams" on public.teams;
create policy "admins manage teams" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.profiles add column if not exists team_id text references public.teams (id) on delete set null;
alter table public.role_assignments add column if not exists team_id text references public.teams (id) on delete set null;
alter table public.findings add column if not exists team_id text references public.teams (id) on delete set null;
create index if not exists findings_team_idx on public.findings (team_id);

-- ---------- role rename: engineer → collaborator
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'engineer', 'collaborator', 'product_owner', 'ux', 'admin'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('engineer', 'collaborator', 'product_owner', 'ux', 'admin'));
update public.profiles set role = 'collaborator', team_id = coalesce(team_id, 'engineering') where role = 'engineer';
update public.role_assignments set role = 'collaborator', team_id = coalesce(team_id, 'engineering') where role = 'engineer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'collaborator', 'product_owner', 'ux', 'admin'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('collaborator', 'product_owner', 'ux', 'admin'));
-- existing findings: the ones assigned to a collaborator belong to that person's team; the imported audit is engineering work
update public.findings f set team_id = p.team_id from public.profiles p where f.assignee = p.id and f.team_id is null and p.team_id is not null;
update public.findings set team_id = 'engineering' where team_id is null and source = 'audit';

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending')
$$;
create or replace function public.my_team() returns text
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid() and active
$$;
-- Does this review hold a finding of mine or of my team? (security definer: avoids policy recursion)
create or replace function public.assigned_in_review(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.findings f where f.review_id = rid
                 and (f.assignee = auth.uid() or (f.team_id is not null and f.team_id = public.my_team())))
$$;
create or replace function public.works_finding(fid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.findings f where f.id = fid
                 and (f.assignee = auth.uid() or (f.team_id is not null and f.team_id = public.my_team())))
$$;

-- ---------- sign-up and approval carry the team
create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare assigned text; assigned_apps text[]; assigned_team text;
begin
  select ra.role, ra.apps, ra.team_id into assigned, assigned_apps, assigned_team from public.role_assignments ra where lower(ra.email) = lower(new.email) and ra.approved;
  insert into public.profiles (id, email, name, avatar_url, role, team_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(assigned, 'pending'), assigned_team)
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, profiles.name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  if tg_op = 'INSERT' and assigned_apps is not null then
    insert into public.profile_apps (profile_id, app_id)
    select new.id, a from unnest(assigned_apps) a where exists (select 1 from public.apps where id = a)
    on conflict do nothing;
  end if;
  return new;
end $$;

create or replace function public.apply_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.approved then return new; end if;
  update public.profiles set role = new.role, team_id = coalesce(new.team_id, team_id) where lower(email) = new.email and role = 'pending';
  if new.role = 'product_owner' and new.apps is not null then
    insert into public.profile_apps (profile_id, app_id)
    select p.id, a from public.profiles p, unnest(new.apps) a where lower(p.email) = new.email and exists (select 1 from public.apps where id = a)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Only admins change a person's team (same guard as role and access).
create or replace function public.guard_profile_role() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an admin can change roles';
    end if;
    if old.role = 'admin' and new.role <> 'admin' and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
      raise exception 'Keep at least one admin';
    end if;
  end if;
  if new.team_id is distinct from old.team_id and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change teams';
  end if;
  if new.active is distinct from old.active then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an admin can change access';
    end if;
    if not new.active and old.id = auth.uid() then
      raise exception 'You cannot remove your own access';
    end if;
  end if;
  return new;
end $$;

-- ---------- reviews: collaborators see reviews holding their team's (or their own) findings
drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews" on public.reviews for select to authenticated
  using (public.is_member() and (public.is_ux() or public.assigned_in_review(id) or (public.is_po() and public.owns_app(app_id))));

-- ---------- findings: team-wide reads and work; routing (team, assignee) by reviewer / admin / product owner;
--            a collaborator may take an unassigned finding of their team or release their own
drop policy if exists "members read findings" on public.findings;
create policy "members read findings" on public.findings for select to authenticated
  using (public.is_member() and (public.is_ux() or assignee = auth.uid() or (team_id is not null and team_id = public.my_team())
                                 or (public.is_po() and public.owns_review(review_id))));
drop policy if exists "members update findings" on public.findings;
create policy "members update findings" on public.findings for update to authenticated
  using (public.is_member() and (public.is_admin() or public.is_reviewer_of(review_id) or public.works_finding(id) or (public.is_po() and public.owns_review(review_id))))
  with check (public.is_member() and (public.is_admin() or public.is_reviewer_of(review_id) or public.works_finding(id) or (public.is_po() and public.owns_review(review_id))));

create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_reviewer_of(new.review_id) then return new; end if;
  if (   new.review_id is distinct from old.review_id or new.code is distinct from old.code or new.screen is distinct from old.screen
      or new.type is distinct from old.type or new.lang is distinct from old.lang or new.sev is distinct from old.sev
      or new.description is distinct from old.description or new.prod is distinct from old.prod or new.figma is distinct from old.figma
      or new.sort_order is distinct from old.sort_order or new.flow is distinct from old.flow or new.flow_group is distinct from old.flow_group
      or new.created_by is distinct from old.created_by or new.created_label is distinct from old.created_label or new.source is distinct from old.source)
  then
    raise exception 'Only the assigned reviewer or an admin can change a finding''s content';
  end if;
  if public.is_po() and public.owns_review(new.review_id) then return new; end if; -- product owner: routing + work
  if new.team_id is distinct from old.team_id then
    raise exception 'Only the reviewer, an admin or the product owner can move a finding to another team';
  end if;
  if new.assignee is distinct from old.assignee then
    -- take an unassigned finding of my team, or release my own
    if not ((old.assignee is null and new.assignee = auth.uid() and old.team_id is not null and old.team_id = public.my_team())
            or (old.assignee = auth.uid() and new.assignee is null)) then
      raise exception 'Only the reviewer, an admin or the product owner can assign a finding to someone else';
    end if;
  end if;
  return new;
end $$;

-- ---------- screenshots: uploads by whoever may work findings of that review
drop policy if exists "members upload screenshots" on storage.objects;
create policy "members upload screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and public.is_member()
              and (public.is_admin() or public.is_reviewer_of(split_part(name, '/', 1)) or public.assigned_in_review(split_part(name, '/', 1))
                   or (public.is_po() and public.owns_review(split_part(name, '/', 1)))));

-- ---------- link view: carry the team name
create or replace function public.review_by_link(rid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rev jsonb; fnd jsonb; ppl jsonb; appname text; tms jsonb;
begin
  if not public.is_domain_user() then raise exception 'Sign in with a walaplus.com account to open this review'; end if;
  select to_jsonb(r) into rev from public.reviews r where r.id = rid;
  if rev is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.sev desc, f.sort_order), '[]'::jsonb) into fnd from public.findings f where f.review_id = rid;
  with ids as (
    select (rev->>'requested_by')::uuid as id union select (rev->>'reviewer')::uuid
    union select f.assignee from public.findings f where f.review_id = rid
    union select f.state_by from public.findings f where f.review_id = rid
    union select f.note_by from public.findings f where f.review_id = rid
    union select f.created_by from public.findings f where f.review_id = rid
  )
  select coalesce(jsonb_object_agg(p.id, coalesce(nullif(p.name, ''), split_part(p.email, '@', 1))), '{}'::jsonb) into ppl
  from public.profiles p where p.id in (select id from ids where id is not null);
  select name into appname from public.apps where id = rev->>'app_id';
  select coalesce(jsonb_object_agg(t.id, t.name), '{}'::jsonb) into tms from public.teams t;
  return jsonb_build_object('review', rev, 'findings', fnd, 'people', ppl, 'app', coalesce(appname, rev->>'app_id'), 'teams', tms);
end $$;

