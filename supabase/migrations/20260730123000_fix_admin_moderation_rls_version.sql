-- Moderation increments submission_version. RLS checks the proposed row,
-- so compare it with the locked row's current version plus one.
create or replace function private.admin_private_word_update_is_safe(
  p_id uuid,
  p_owner_user_id uuid,
  p_word text,
  p_normalized_word text,
  p_ipa text,
  p_audio_url text,
  p_image_url text,
  p_image_object_key text,
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
      and p_image_object_key is not distinct from existing.image_object_key
      and p_submission_version = existing.submission_version + 1
      and p_created_at is not distinct from existing.created_at
  );
$$;
