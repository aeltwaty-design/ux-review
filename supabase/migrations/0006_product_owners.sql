-- Product Owner role: sees every review, finding and KPI of the products (apps) assigned to them, assigns / reassigns
-- findings of those products to any invited member, and can change finding state, notes and screenshots.
-- Cannot raise requests, run reviews, or add/edit/delete findings.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('engineer', 'product_owner', 'ux', 'admin'));
alter table public.role_assignments drop constraint if exists role_assignments_role_check;
alter table public.role_assignments add constraint role_assignments_role_check check (role in ('engineer', 'product_owner', 'ux', 'admin'));
alter table public.role_assignments add column if not exists apps text[] not null default '{}';

-- Which products a profile owns (used for product_owner; harmless for other roles).
create table if not exists public.profile_apps (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  app_id text not null references public.apps(id) on delete cascade,
  primary key (profile_id, app_id)
);
alter table public.profile_apps enable row level security;
drop policy if exists "members read profile apps" on public.profile_apps;
create policy "members read profile apps" on public.profile_apps for select to authenticated using (public.is_member());
drop policy if exists "admins manage profile apps" on public.profile_apps;
create policy "admins manage profile apps" on public.profile_apps for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.is_po() returns boolean language sql stable as $$ select public.my_role() = 'product_owner' $$;
create or replace function public.owns_app(app text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_apps pa where pa.profile_id = auth.uid() and pa.app_id = app)
$$;
create or replace function public.owns_review(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reviews r join public.profile_apps pa on pa.app_id = r.app_id
                 where r.id = rid and pa.profile_id = auth.uid())
$$;

-- Pre-invited product owners get their products at first sign-in.
create or replace function public.sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare assigned text; assigned_apps text[];
begin
  select ra.role, ra.apps into assigned, assigned_apps from public.role_assignments ra where lower(ra.email) = lower(new.email);
  insert into public.profiles (id, email, name, avatar_url, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(assigned, 'engineer'))
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

-- ---------- reviews: product owners read their products' reviews
drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews" on public.reviews for select to authenticated
  using (public.is_member() and (public.is_ux() or public.assigned_in_review(id) or (public.is_po() and public.owns_app(app_id))));

-- ---------- findings: product owners read and update (state, note, screenshots, assignee) their products' findings
drop policy if exists "members read findings" on public.findings;
create policy "members read findings" on public.findings for select to authenticated
  using (public.is_member() and (public.is_ux() or assignee = auth.uid() or (public.is_po() and public.owns_review(review_id))));
drop policy if exists "members update findings" on public.findings;
create policy "members update findings" on public.findings for update to authenticated
  using (public.is_member() and (public.is_ux() or assignee = auth.uid() or (public.is_po() and public.owns_review(review_id))))
  with check (public.is_member() and (public.is_ux() or assignee = auth.uid() or (public.is_po() and public.owns_review(review_id))));

create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_ux() then return new; end if;
  if (   new.review_id is distinct from old.review_id or new.code is distinct from old.code or new.screen is distinct from old.screen
      or new.type is distinct from old.type or new.lang is distinct from old.lang or new.sev is distinct from old.sev
      or new.description is distinct from old.description or new.prod is distinct from old.prod or new.figma is distinct from old.figma
      or new.sort_order is distinct from old.sort_order or new.flow is distinct from old.flow or new.flow_group is distinct from old.flow_group
      or new.created_by is distinct from old.created_by or new.created_label is distinct from old.created_label or new.source is distinct from old.source)
  then
    raise exception 'Only the UX team can change a finding''s content';
  end if;
  if (new.assignee is distinct from old.assignee or new.assigned_by is distinct from old.assigned_by or new.assigned_at is distinct from old.assigned_at)
     and not (public.is_po() and public.owns_review(new.review_id))
  then
    raise exception 'Only the UX team or the product owner can assign a finding';
  end if;
  return new;
end $$;

-- ---------- screenshots: product owners read images of their products' findings
drop policy if exists "members read screenshots" on storage.objects;
create policy "members read screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and public.is_member()
         and (public.is_ux()
              or (public.is_po() and public.owns_review(split_part(name, '/', 1)))
              or exists (select 1 from public.findings f where f.assignee = auth.uid()
                         and f.review_id = split_part(name, '/', 1) and f.code = split_part(name, '/', 2))));
