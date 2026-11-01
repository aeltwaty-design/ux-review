-- A UX team member who is not the assigned reviewer of a review can't change anything in it: not the status, not
-- the findings (add/edit/delete, state, notes, screenshots, assignment). The assigned reviewer keeps everything except
-- close/reopen/withdraw; admins keep everything; product owners and assigned engineers are unchanged.
-- (Also undoes the review-level assignee that migration "review_assignee" added on the live project: per-finding
-- assignment stays the model.)

alter table public.reviews drop column if exists assignee;
alter table public.reviews drop column if exists assigned_by;
alter table public.reviews drop column if exists assigned_at;
drop function if exists public.is_assignee_of(text);
drop function if exists public.review_app(text);

create or replace function public.is_reviewer_of(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_ux() and exists (select 1 from public.reviews r where r.id = rid and r.reviewer = auth.uid())
$$;

-- ---------- reviews: who reads is unchanged; what a non-admin may change is decided here
drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews" on public.reviews for select to authenticated
  using (public.is_member() and (public.is_ux() or public.assigned_in_review(id) or (public.is_po() and public.owns_app(app_id))));

create or replace function public.guard_review_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role, SQL editor, functions
  if public.is_admin() then return new; end if;
  if (new.status = 'done') is distinct from (old.status = 'done') then
    raise exception 'Only an admin can close or reopen a review';
  end if;
  if public.is_ux() and old.reviewer = auth.uid() then return new; end if; -- the assigned reviewer
  if public.is_ux() then raise exception 'Only the assigned reviewer or an admin can change this review'; end if;
  -- product owner of this product: the status only
  if new.reviewer is distinct from old.reviewer or new.reviewer_label is distinct from old.reviewer_label
     or new.app_id <> old.app_id or new.flow <> old.flow or new.platform <> old.platform or new.build <> old.build
     or new.screens <> old.screens or new.figma <> old.figma or new.languages <> old.languages or new.reach <> old.reach
     or new.story <> old.story or new.requested_by is distinct from old.requested_by
     or new.requester_label is distinct from old.requester_label or new.page is distinct from old.page
     or new.source <> old.source or new.created_at <> old.created_at then
    raise exception 'Product owners can only change the review status';
  end if;
  return new;
end $$;

-- ---------- findings: the reviewer (or admin) writes content; assignees and product owners work state/note/screenshots
drop policy if exists "members read findings" on public.findings;
create policy "members read findings" on public.findings for select to authenticated
  using (public.is_member() and (public.is_ux() or assignee = auth.uid() or (public.is_po() and public.owns_review(review_id))));
drop policy if exists "ux insert findings" on public.findings;
create policy "ux insert findings" on public.findings for insert to authenticated
  with check (public.is_member() and (public.is_admin() or public.is_reviewer_of(review_id)));
drop policy if exists "members update findings" on public.findings;
create policy "members update findings" on public.findings for update to authenticated
  using (public.is_member() and (public.is_admin() or public.is_reviewer_of(review_id) or assignee = auth.uid() or (public.is_po() and public.owns_review(review_id))))
  with check (public.is_member() and (public.is_admin() or public.is_reviewer_of(review_id) or assignee = auth.uid() or (public.is_po() and public.owns_review(review_id))));
drop policy if exists "ux delete findings" on public.findings;
create policy "ux delete findings" on public.findings for delete to authenticated
  using (public.is_member() and (public.is_admin() or public.is_reviewer_of(review_id)));

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
  if (new.assignee is distinct from old.assignee or new.assigned_by is distinct from old.assigned_by or new.assigned_at is distinct from old.assigned_at)
     and not (public.is_po() and public.owns_review(new.review_id))
  then
    raise exception 'Only the assigned reviewer, an admin or the product owner can assign a finding';
  end if;
  return new;
end $$;

-- ---------- screenshots: uploads by whoever may work findings of that review (reads stay open to the domain for links)
drop policy if exists "members upload screenshots" on storage.objects;
create policy "members upload screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and public.is_member()
              and (public.is_admin() or public.is_reviewer_of(split_part(name, '/', 1)) or public.assigned_in_review(split_part(name, '/', 1))
                   or (public.is_po() and public.owns_review(split_part(name, '/', 1)))));
