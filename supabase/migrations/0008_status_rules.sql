-- Status rules: product owners may move a review of their products between Requested, In progress and Delivered;
-- only an admin may close (done) or reopen a review; the UX team may do everything except close/reopen.

drop policy if exists "owners update reviews" on public.reviews;
create policy "owners update reviews" on public.reviews for update to authenticated
  using (public.is_member() and public.is_po() and public.owns_review(id))
  with check (public.is_member() and public.is_po() and public.owns_review(id));

create or replace function public.guard_review_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role, SQL editor, functions
  if (new.status = 'done') is distinct from (old.status = 'done') and not public.is_admin() then
    raise exception 'Only an admin can close or reopen a review';
  end if;
  if new.reviewer is distinct from old.reviewer and not public.is_ux() then
    raise exception 'Only the UX team can change the reviewer';
  end if;
  if not public.is_ux() then
    -- product owners: status and its dates only; the request itself stays as the UX team wrote it
    if new.app_id <> old.app_id or new.flow <> old.flow or new.platform <> old.platform or new.build <> old.build
       or new.screens <> old.screens or new.figma <> old.figma or new.languages <> old.languages or new.reach <> old.reach
       or new.story <> old.story or new.requested_by is distinct from old.requested_by
       or new.requester_label is distinct from old.requester_label or new.reviewer_label is distinct from old.reviewer_label
       or new.page is distinct from old.page or new.source <> old.source or new.created_at <> old.created_at then
      raise exception 'Product owners can only change the review status';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_review_update on public.reviews;
create trigger guard_review_update before update on public.reviews for each row execute function public.guard_review_update();
