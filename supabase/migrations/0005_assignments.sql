-- Per-finding assignment. Engineers see ONLY the findings assigned to them (and the review each belongs to).
-- Requests are raised by the UX team and admins; engineers never raise or edit requests.

alter table public.findings add column if not exists assignee uuid references public.profiles(id) on delete set null;
alter table public.findings add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.findings add column if not exists assigned_at timestamptz;
create index if not exists findings_assignee_idx on public.findings (assignee);

-- Does the current user have a finding assigned in this review? (security definer: avoids policy recursion)
create or replace function public.assigned_in_review(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.findings f where f.review_id = rid and f.assignee = auth.uid())
$$;

-- ---------- reviews: UX/admin see and manage everything; engineers see only reviews they are assigned in
drop policy if exists "members read reviews" on public.reviews;
create policy "members read reviews" on public.reviews for select to authenticated
  using (public.is_member() and (public.is_ux() or public.assigned_in_review(id)));
drop policy if exists "members raise requests" on public.reviews;
drop policy if exists "ux raise requests" on public.reviews;
create policy "ux raise requests" on public.reviews for insert to authenticated
  with check (public.is_member() and public.is_ux() and requested_by = auth.uid() and status = 'requested');
drop policy if exists "engineers edit own open request" on public.reviews;
drop policy if exists "engineers withdraw own request" on public.reviews;
-- "ux update reviews" and "ux delete reviews" stay as they are.

-- ---------- findings: UX/admin everything; engineers read and update (state, note, screenshots) their own
drop policy if exists "members read findings" on public.findings;
create policy "members read findings" on public.findings for select to authenticated
  using (public.is_member() and (public.is_ux() or assignee = auth.uid()));
drop policy if exists "members update findings" on public.findings;
create policy "members update findings" on public.findings for update to authenticated
  using (public.is_member() and (public.is_ux() or assignee = auth.uid()))
  with check (public.is_member() and (public.is_ux() or assignee = auth.uid()));

create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_ux() and (
       new.review_id is distinct from old.review_id or new.code is distinct from old.code or new.screen is distinct from old.screen
    or new.type is distinct from old.type or new.lang is distinct from old.lang or new.sev is distinct from old.sev
    or new.description is distinct from old.description or new.prod is distinct from old.prod or new.figma is distinct from old.figma
    or new.sort_order is distinct from old.sort_order or new.flow is distinct from old.flow or new.flow_group is distinct from old.flow_group
    or new.created_by is distinct from old.created_by or new.created_label is distinct from old.created_label or new.source is distinct from old.source
    or new.assignee is distinct from old.assignee or new.assigned_by is distinct from old.assigned_by or new.assigned_at is distinct from old.assigned_at)
  then
    raise exception 'Engineers can change a finding''s state, note and screenshots only';
  end if;
  return new;
end $$;

-- ---------- screenshots: engineers read only images of their own findings
drop policy if exists "members read screenshots" on storage.objects;
create policy "members read screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and public.is_member()
         and (public.is_ux() or exists (select 1 from public.findings f where f.assignee = auth.uid()
                                        and f.review_id = split_part(name, '/', 1) and f.code = split_part(name, '/', 2))));
