-- Who edits a review row. Admins: everything. The assigned reviewer (a UX team member whose id is reviews.reviewer):
-- everything on that review except closing/reopening and withdrawing. Other UX members and product owners: the status
-- (up to Delivered) and nothing else. Withdrawing (delete) is admin-only.

drop policy if exists "ux delete reviews" on public.reviews;
drop policy if exists "admins delete reviews" on public.reviews;
create policy "admins delete reviews" on public.reviews for delete to authenticated using (public.is_member() and public.is_admin());

create or replace function public.guard_review_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role, SQL editor, functions
  if public.is_admin() then return new; end if;
  if (new.status = 'done') is distinct from (old.status = 'done') then
    raise exception 'Only an admin can close or reopen a review';
  end if;
  if public.is_ux() and old.reviewer = auth.uid() then return new; end if; -- the assigned reviewer
  if new.reviewer is distinct from old.reviewer or new.reviewer_label is distinct from old.reviewer_label then
    raise exception 'Only an admin or the assigned reviewer can change the reviewer';
  end if;
  if new.app_id <> old.app_id or new.flow <> old.flow or new.platform <> old.platform or new.build <> old.build
     or new.screens <> old.screens or new.figma <> old.figma or new.languages <> old.languages or new.reach <> old.reach
     or new.story <> old.story or new.requested_by is distinct from old.requested_by
     or new.requester_label is distinct from old.requester_label or new.page is distinct from old.page
     or new.source <> old.source or new.created_at <> old.created_at then
    raise exception 'Only an admin or the assigned reviewer can edit a request';
  end if;
  return new;
end $$;
