-- Admin approval. Any walaplus.com account can sign in; until an admin approves it and sets its role it is "pending"
-- (waiting admin approval): it can open review links read-only and nothing else. Any member can invite a WalaPlus
-- account with a suggested role; the invitee is still pending until an admin approves. Admin invitations are approved
-- at once. The former "viewer" role becomes "pending".

alter table public.role_assignments add column if not exists invited_by uuid references public.profiles (id) on delete set null;
alter table public.role_assignments add column if not exists approved boolean not null default false;
alter table public.role_assignments add column if not exists approved_by uuid references public.profiles (id) on delete set null;
alter table public.role_assignments add column if not exists approved_at timestamptz;
update public.role_assignments set approved = true, approved_at = coalesce(approved_at, created_at) where approved = false and invited_by is null; -- everything so far was an admin's invitation

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'viewer', 'engineer', 'product_owner', 'ux', 'admin'));
update public.profiles set role = 'pending' where role = 'viewer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending', 'engineer', 'product_owner', 'ux', 'admin'));
alter table public.profiles alter column role set default 'pending';
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('engineer', 'product_owner', 'ux', 'admin'));

-- Member = walaplus.com, active, approved role. Domain user (links) unchanged: active profile of the domain.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@walaplus.com'
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role <> 'pending')
$$;

-- Sign-up: the role comes from an APPROVED invitation, else pending.
create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare assigned text; assigned_apps text[];
begin
  select ra.role, ra.apps into assigned, assigned_apps from public.role_assignments ra where lower(ra.email) = lower(new.email) and ra.approved;
  insert into public.profiles (id, email, name, avatar_url, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(assigned, 'pending'))
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

-- Invitations: admins manage everything; any member may add one (it is recorded as pending, in their name).
create or replace function public.guard_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if auth.uid() is null then return new; end if;
  if public.is_admin() then
    if tg_op = 'INSERT' and new.invited_by is null then new.invited_by := auth.uid(); end if;
    if new.approved and (tg_op = 'INSERT' or not old.approved) then new.approved_by := auth.uid(); new.approved_at := now(); end if;
    return new;
  end if;
  if tg_op <> 'INSERT' then raise exception 'Only an admin can change an invitation'; end if;
  new.invited_by := auth.uid(); new.approved := false; new.approved_by := null; new.approved_at := null;
  return new;
end $$;
drop trigger if exists guard_role_assignment on public.role_assignments;
create trigger guard_role_assignment before insert or update on public.role_assignments for each row execute function public.guard_role_assignment();

drop policy if exists "members invite" on public.role_assignments;
create policy "members invite" on public.role_assignments for insert to authenticated with check (public.is_member());
drop policy if exists "members read invitations" on public.role_assignments;
create policy "members read invitations" on public.role_assignments for select to authenticated using (public.is_member());
-- "admins manage role assignments" (for all) stays.

-- An approved invitation upgrades a pending account at once (and sets a product owner's products).
create or replace function public.apply_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.approved then return new; end if;
  update public.profiles set role = new.role where lower(email) = new.email and role = 'pending';
  if new.role = 'product_owner' and new.apps is not null then
    insert into public.profile_apps (profile_id, app_id)
    select p.id, a from public.profiles p, unnest(new.apps) a where lower(p.email) = new.email and exists (select 1 from public.apps where id = a)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists apply_role_assignment on public.role_assignments;
create trigger apply_role_assignment after insert or update on public.role_assignments for each row execute function public.apply_role_assignment();

-- Everyone may still read their own profile (the app needs the role); the review link view is unchanged (is_domain_user).
