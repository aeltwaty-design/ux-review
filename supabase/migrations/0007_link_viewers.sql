-- Review links. Any walaplus.com account may sign in; one that was not invited becomes a "viewer": it can open a review
-- by its link (read-only, through review_by_link) and nothing else. Invited roles keep the board as before.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('viewer', 'engineer', 'product_owner', 'ux', 'admin'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('viewer', 'engineer', 'product_owner', 'ux', 'admin'));

-- Domain user: a walaplus.com account whose access was not removed. Member: a domain user with an invited role.
create or replace function public.is_domain_user() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@walaplus.com'
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@walaplus.com'
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role <> 'viewer')
$$;

-- Sign-up: domain only; the role comes from the invitation, else viewer.
create or replace function public.check_signup_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email, '')) not like '%@walaplus.com' then
    raise exception 'Only walaplus.com accounts can use UX Reviews';
  end if;
  return new;
end $$;

create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare assigned text; assigned_apps text[];
begin
  select ra.role, ra.apps into assigned, assigned_apps from public.role_assignments ra where lower(ra.email) = lower(new.email);
  insert into public.profiles (id, email, name, avatar_url, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(assigned, 'viewer'))
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

-- Everyone may read their own profile (the app needs the role); members read all.
drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.is_member());

-- Inviting an email that already signed in as a viewer upgrades them at once.
create or replace function public.apply_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = new.role where lower(email) = lower(new.email) and role = 'viewer';
  if new.role = 'product_owner' and new.apps is not null then
    insert into public.profile_apps (profile_id, app_id)
    select p.id, a from public.profiles p, unnest(new.apps) a where lower(p.email) = lower(new.email) and exists (select 1 from public.apps where id = a)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists apply_role_assignment on public.role_assignments;
create trigger apply_role_assignment after insert or update on public.role_assignments for each row execute function public.apply_role_assignment();

-- Screenshots: any domain user may read (masked images; needed for the read-only link view).
drop policy if exists "members read screenshots" on storage.objects;
create policy "members read screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and public.is_domain_user());

-- The read-only link view: one review with its findings and the names it refers to.
create or replace function public.review_by_link(rid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rev jsonb; fnd jsonb; ppl jsonb; appname text;
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
  return jsonb_build_object('review', rev, 'findings', fnd, 'people', ppl, 'app', coalesce(appname, rev->>'app_id'));
end $$;
revoke all on function public.review_by_link(text) from public;
grant execute on function public.review_by_link(text) to authenticated;
