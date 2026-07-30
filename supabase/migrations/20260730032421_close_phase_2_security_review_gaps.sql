-- Restore the narrow identity-table grants intended by the original schema.
-- Supabase's legacy default privileges had also granted destructive operations.
revoke all privileges on table
  public.users,
  public.user_roles,
  public.user_settings,
  public.app_settings,
  public.ai_auto_fill_usage
from public, anon, authenticated;

revoke update (
  id,
  email,
  display_name,
  avatar_url,
  timezone,
  study_day_starts_at,
  created_at,
  updated_at
) on table public.users from public, anon, authenticated;

grant select on table public.users to authenticated;
grant update (
  display_name,
  avatar_url,
  timezone,
  study_day_starts_at
) on table public.users to authenticated;
grant select on table public.user_roles to authenticated;
grant select, update on table public.user_settings to authenticated;
grant select, update on table public.app_settings to authenticated;
grant select on table public.ai_auto_fill_usage to authenticated;

-- ON DELETE SET NULL mutates immutable attempt history through a referential
-- action. Keep cards deletable only while no attempt references them.
alter table public.study_attempts
  drop constraint if exists study_attempts_learning_card_id_fkey;
alter table public.study_attempts
  add constraint study_attempts_learning_card_id_fkey
  foreign key (learning_card_id)
  references public.learning_cards(id)
  on delete restrict;

-- Learners may edit a submission only while it is pending. The moderation
-- fields and ownership must remain unchanged.
create or replace function private.learner_private_word_update_is_safe(
  p_id uuid,
  p_owner_user_id uuid,
  p_status text,
  p_submission_version integer,
  p_created_at timestamptz,
  p_admin_comment text,
  p_merged_global_word_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select exists (
    select 1
    from public.private_words existing
    where existing.id = p_id
      and existing.owner_user_id = (select auth.uid())
      and existing.status = 'pending'
      and p_owner_user_id = existing.owner_user_id
      and p_status = 'pending'
      and p_admin_comment is not distinct from existing.admin_comment
      and p_merged_global_word_id
        is not distinct from existing.merged_global_word_id
      and p_submission_version between
        existing.submission_version
        and existing.submission_version + 1
      and p_created_at is not distinct from existing.created_at
  );
$$;

-- Admins moderate status/comment/merge fields but cannot rewrite or reassign
-- learner-authored content.
create or replace function private.admin_private_word_update_is_safe(
  p_id uuid,
  p_owner_user_id uuid,
  p_word text,
  p_normalized_word text,
  p_ipa text,
  p_audio_url text,
  p_image_url text,
  p_submission_version integer,
  p_created_at timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select exists (
    select 1
    from public.private_words existing
    where existing.id = p_id
      and p_owner_user_id = existing.owner_user_id
      and p_word is not distinct from existing.word
      and p_normalized_word is not distinct from existing.normalized_word
      and p_ipa is not distinct from existing.ipa
      and p_audio_url is not distinct from existing.audio_url
      and p_image_url is not distinct from existing.image_url
      and p_submission_version = existing.submission_version
      and p_created_at is not distinct from existing.created_at
  );
$$;

revoke all on function private.learner_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  integer,
  timestamptz,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function private.admin_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz
) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.learner_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  integer,
  timestamptz,
  text,
  uuid
) to authenticated;
grant execute on function private.admin_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz
) to authenticated;

drop policy if exists "owners update private words" on public.private_words;
drop policy if exists "owners update pending private words"
  on public.private_words;
drop policy if exists "admins moderate private words" on public.private_words;
drop policy if exists "owners delete private words" on public.private_words;
drop policy if exists "owners delete pending private words"
  on public.private_words;

drop function if exists private.learner_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid
);

create policy "owners update pending private words"
on public.private_words
for update
to authenticated
using (
  owner_user_id = (select auth.uid())
  and status = 'pending'
)
with check (
  (
    select private.learner_private_word_update_is_safe(
      id,
      owner_user_id,
      status,
      submission_version,
      created_at,
      admin_comment,
      merged_global_word_id
    )
  )
);

create policy "admins moderate private words"
on public.private_words
for update
to authenticated
using ((select private.is_admin()))
with check (
  (select private.is_admin())
  and (
    select private.admin_private_word_update_is_safe(
      id,
      owner_user_id,
      word,
      normalized_word,
      ipa,
      audio_url,
      image_url,
      submission_version,
      created_at
    )
  )
);

create policy "owners delete pending private words"
on public.private_words
for delete
to authenticated
using (
  owner_user_id = (select auth.uid())
  and status = 'pending'
);

-- Meanings are part of learner-authored submission content and therefore
-- follow the same pending-only mutation lifecycle as their parent word.
drop policy if exists "owners insert private meanings"
  on public.private_meanings;
drop policy if exists "owners insert pending private meanings"
  on public.private_meanings;
drop policy if exists "owners update private meanings"
  on public.private_meanings;
drop policy if exists "owners update pending private meanings"
  on public.private_meanings;
drop policy if exists "owners delete private meanings"
  on public.private_meanings;
drop policy if exists "owners delete pending private meanings"
  on public.private_meanings;

create policy "owners insert pending private meanings"
on public.private_meanings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
      and word.status = 'pending'
  )
);

create policy "owners update pending private meanings"
on public.private_meanings
for update
to authenticated
using (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
      and word.status = 'pending'
  )
)
with check (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
      and word.status = 'pending'
  )
);

create policy "owners delete pending private meanings"
on public.private_meanings
for delete
to authenticated
using (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
      and word.status = 'pending'
  )
);
