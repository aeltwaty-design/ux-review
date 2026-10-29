-- Invitation only. A walaplus.com account can sign in only if an admin invited the email first (role_assignments).
-- Admins can also remove someone's access later (profiles.active = false): every read and write is then refused.

alter table public.profiles add column if not exists active boolean not null default true;

-- Membership = walaplus.com email AND an active profile (security definer so policies on profiles don't recurse).
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@walaplus.com'
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

-- Sign-up gate: domain + invitation.
create or replace function public.check_signup_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email, '')) not like '%@walaplus.com' then
    raise exception 'Only walaplus.com accounts can use UX Reviews';
  end if;
  if not exists (select 1 from public.role_assignments ra where lower(ra.email) = lower(new.email)) then
    raise exception 'UX Reviews is invitation only: ask an admin to invite %', new.email;
  end if;
  return new;
end $$;

-- Only admins change roles or access; nobody removes their own access; never remove the last admin.
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

-- People who already signed in count as invited.
insert into public.role_assignments (email, role)
select lower(email), role from public.profiles
on conflict (email) do nothing;
