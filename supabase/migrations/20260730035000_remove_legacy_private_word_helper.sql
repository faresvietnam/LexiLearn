-- Remove the legacy helper overload left by the first hardening migration.
-- The canonical helper takes timestamptz for created_at.
revoke all on function private.learner_private_word_update_is_safe(
  uuid, uuid, text, integer, text, uuid
) from public, anon, authenticated;
drop function if exists private.learner_private_word_update_is_safe(
  uuid, uuid, text, integer, text, uuid
);
