-- Private vocabulary is owner-managed and studyable immediately. Keep the
-- historical moderation tables for migration replay, but remove their active
-- authorization and mutation path.
update public.private_words
set status = 'approved',
    admin_comment = null,
    merged_global_word_id = null,
    updated_at = now()
where status in ('pending', 'rejected');

alter table public.private_words
  drop constraint if exists private_words_status_check;

alter table public.private_words
  add constraint private_words_status_check
  check (status in ('approved', 'archived'));

drop policy if exists "admins read private word submissions" on public.private_words;
drop policy if exists "admins moderate private words" on public.private_words;
drop policy if exists "owners update pending private words" on public.private_words;
drop policy if exists "owners delete pending private words" on public.private_words;
drop policy if exists "admins read private submission meanings" on public.private_meanings;

drop policy if exists "owners insert private words" on public.private_words;
drop policy if exists "owners update private words" on public.private_words;

create policy "owners insert private words"
on public.private_words
for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and status = 'approved'
  and submission_version = 1
  and admin_comment is null
  and merged_global_word_id is null
);

create policy "owners update private words"
on public.private_words
for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  owner_user_id = (select auth.uid())
  and status = 'approved'
  and admin_comment is null
  and merged_global_word_id is null
);

drop function if exists public.moderate_private_word(uuid, text, integer, uuid, text);
