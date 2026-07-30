alter table public.private_words
  add column image_object_key text;

alter table public.private_words
  add constraint private_words_image_object_key_scope_check
  check (
    image_object_key is null
    or (
      image_url is not null
      and image_object_key like
        'users/' || owner_user_id::text || '/images/%'
      and image_object_key ~
        '^users/[0-9a-f-]{36}/images/[0-9a-f-]{36}\.(jpg|png|webp)$'
    )
  );

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
      and p_submission_version = existing.submission_version
      and p_created_at is not distinct from existing.created_at
  );
$$;

revoke all on function private.admin_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz
) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.admin_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz
) to authenticated;

drop policy if exists "admins moderate private words"
  on public.private_words;

drop function if exists private.admin_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz
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
      image_object_key,
      submission_version,
      created_at
    )
  )
);
