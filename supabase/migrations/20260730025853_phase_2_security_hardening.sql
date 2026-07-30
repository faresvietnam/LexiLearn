-- Keep this migration replayable: older environments may never have had the
-- deprecated public helper, while partially migrated ones still can.
drop function if exists public.is_admin();

-- RLS policies run as the caller, so these helpers intentionally remain
-- security invokers. They can only see rows the authenticated caller may see.
create or replace function private.learner_private_word_update_is_safe(
  p_id uuid,
  p_owner_user_id uuid,
  p_status text,
  p_submission_version integer,
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
      and p_owner_user_id = existing.owner_user_id
      and p_status is not distinct from existing.status
      and p_admin_comment is not distinct from existing.admin_comment
      and p_merged_global_word_id
        is not distinct from existing.merged_global_word_id
      and p_submission_version between
        existing.submission_version
        and existing.submission_version + 1
  );
$$;

create or replace function private.learner_study_session_transition_is_valid(
  p_id uuid,
  p_user_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_scope_snapshot jsonb,
  p_review_limit integer,
  p_new_word_limit integer,
  p_status text
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select exists (
    select 1
    from public.study_sessions existing
    where existing.id = p_id
      and existing.user_id = (select auth.uid())
      and existing.status = 'active'
      and p_user_id = existing.user_id
      and p_started_at is not distinct from existing.started_at
      and p_scope_snapshot is not distinct from existing.scope_snapshot
      and p_review_limit = existing.review_limit
      and p_new_word_limit = existing.new_word_limit
      and (
        (
          p_status = 'paused'
          and p_ended_at is not distinct from existing.ended_at
        )
        or (
          p_status = 'completed'
          and p_ended_at is not null
          and p_ended_at >= existing.started_at
        )
      )
  );
$$;

create or replace function private.personal_vocabulary_references_are_valid(
  p_user_id uuid,
  p_global_word_id uuid,
  p_private_word_id uuid,
  p_deck_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    p_user_id = (select auth.uid())
    and (
      p_deck_id is null
      or exists (
        select 1
        from public.decks
        where id = p_deck_id
          and user_id = (select auth.uid())
      )
    )
    and (
      (
        p_global_word_id is not null
        and p_private_word_id is null
        and exists (
          select 1
          from public.global_words
          where id = p_global_word_id
            and status = 'active'
        )
      )
      or (
        p_global_word_id is null
        and p_private_word_id is not null
        and exists (
          select 1
          from public.private_words
          where id = p_private_word_id
            and owner_user_id = (select auth.uid())
        )
      )
    );
$$;

create or replace function private.study_scope_references_are_owned(
  p_active_deck_ids uuid[],
  p_excluded_tag_ids uuid[],
  p_paused_word_ids uuid[]
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    not exists (
      select 1
      from unnest(coalesce(p_active_deck_ids, '{}'::uuid[])) referenced(id)
      where not exists (
        select 1
        from public.decks
        where decks.id = referenced.id
          and decks.user_id = (select auth.uid())
      )
    )
    and not exists (
      select 1
      from unnest(coalesce(p_excluded_tag_ids, '{}'::uuid[])) referenced(id)
      where not exists (
        select 1
        from public.tags
        where tags.id = referenced.id
          and tags.user_id = (select auth.uid())
      )
    )
    and not exists (
      select 1
      from unnest(coalesce(p_paused_word_ids, '{}'::uuid[])) referenced(id)
      where not exists (
        select 1
        from public.personal_vocabulary
        where personal_vocabulary.id = referenced.id
          and personal_vocabulary.user_id = (select auth.uid())
      )
    );
$$;

create or replace function private.learning_card_references_are_valid(
  p_user_id uuid,
  p_personal_vocabulary_id uuid,
  p_meaning_source_id uuid,
  p_meaning_source_type text
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.personal_vocabulary vocabulary
      where vocabulary.id = p_personal_vocabulary_id
        and vocabulary.user_id = (select auth.uid())
        and (
          (
            p_meaning_source_type = 'global_meaning'
            and vocabulary.global_word_id is not null
            and exists (
              select 1
              from public.global_meanings meaning
              join public.global_words word
                on word.id = meaning.global_word_id
              where meaning.id = p_meaning_source_id
                and meaning.global_word_id = vocabulary.global_word_id
                and meaning.status = 'active'
                and word.status = 'active'
            )
          )
          or (
            p_meaning_source_type = 'private_meaning'
            and vocabulary.private_word_id is not null
            and exists (
              select 1
              from public.private_meanings meaning
              where meaning.id = p_meaning_source_id
                and meaning.private_word_id = vocabulary.private_word_id
            )
          )
        )
    );
$$;

create or replace function private.study_attempt_references_are_owned(
  p_user_id uuid,
  p_learning_card_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.study_sessions
      where id = p_session_id
        and user_id = (select auth.uid())
    )
    and (
      p_learning_card_id is null
      or exists (
        select 1
        from public.learning_cards
        where id = p_learning_card_id
          and user_id = (select auth.uid())
      )
    );
$$;

revoke all on function private.learner_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function private.learner_study_session_transition_is_valid(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  integer,
  integer,
  text
) from public, anon, authenticated;
revoke all on function private.personal_vocabulary_references_are_valid(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function private.study_scope_references_are_owned(
  uuid[],
  uuid[],
  uuid[]
) from public, anon, authenticated;
revoke all on function private.learning_card_references_are_valid(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function private.study_attempt_references_are_owned(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.learner_private_word_update_is_safe(
  uuid,
  uuid,
  text,
  integer,
  text,
  uuid
) to authenticated;
grant execute on function private.learner_study_session_transition_is_valid(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  integer,
  integer,
  text
) to authenticated;
grant execute on function private.personal_vocabulary_references_are_valid(
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated;
grant execute on function private.study_scope_references_are_owned(
  uuid[],
  uuid[],
  uuid[]
) to authenticated;
grant execute on function private.learning_card_references_are_valid(
  uuid,
  uuid,
  uuid,
  text
) to authenticated;
grant execute on function private.study_attempt_references_are_owned(
  uuid,
  uuid,
  uuid
) to authenticated;

-- Remove implicit default privileges first, then add only the Data API
-- operations that the application needs. RLS provides row authorization.
revoke all privileges on table
  public.global_words,
  public.global_meanings,
  public.global_examples,
  public.word_parts,
  public.private_words,
  public.private_meanings,
  public.decks,
  public.tags,
  public.personal_vocabulary,
  public.personal_word_tags,
  public.study_scope,
  public.learning_cards,
  public.study_sessions,
  public.study_attempts
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.global_words,
  public.global_meanings,
  public.global_examples,
  public.word_parts
to authenticated;

grant select, insert, update, delete on table
  public.private_words,
  public.private_meanings,
  public.decks,
  public.tags,
  public.personal_vocabulary,
  public.personal_word_tags,
  public.study_scope,
  public.learning_cards
to authenticated;

grant select, insert, update on table
  public.study_sessions
to authenticated;

grant select, insert on table
  public.study_attempts
to authenticated;

-- Drop the original broad policies and every policy recreated below so the
-- migration itself remains safe to replay.
drop policy if exists "read active global words" on public.global_words;
drop policy if exists "admins manage global words" on public.global_words;
drop policy if exists "authenticated read global words"
  on public.global_words;
drop policy if exists "admins insert global words" on public.global_words;
drop policy if exists "admins update global words" on public.global_words;
drop policy if exists "admins delete global words" on public.global_words;

drop policy if exists "read global meanings" on public.global_meanings;
drop policy if exists "admins manage global meanings" on public.global_meanings;
drop policy if exists "authenticated read global meanings"
  on public.global_meanings;
drop policy if exists "admins insert global meanings"
  on public.global_meanings;
drop policy if exists "admins update global meanings"
  on public.global_meanings;
drop policy if exists "admins delete global meanings"
  on public.global_meanings;

drop policy if exists "read global examples" on public.global_examples;
drop policy if exists "admins manage global examples" on public.global_examples;
drop policy if exists "authenticated read global examples"
  on public.global_examples;
drop policy if exists "admins insert global examples"
  on public.global_examples;
drop policy if exists "admins update global examples"
  on public.global_examples;
drop policy if exists "admins delete global examples"
  on public.global_examples;

drop policy if exists "read word parts" on public.word_parts;
drop policy if exists "admins manage word parts" on public.word_parts;
drop policy if exists "authenticated read word parts" on public.word_parts;
drop policy if exists "admins insert word parts" on public.word_parts;
drop policy if exists "admins update word parts" on public.word_parts;
drop policy if exists "admins delete word parts" on public.word_parts;

drop policy if exists "owners manage private words" on public.private_words;
drop policy if exists "owners read private words" on public.private_words;
drop policy if exists "admins read private word submissions"
  on public.private_words;
drop policy if exists "owners insert private words" on public.private_words;
drop policy if exists "owners update private words" on public.private_words;
drop policy if exists "admins moderate private words" on public.private_words;
drop policy if exists "owners delete private words" on public.private_words;

drop policy if exists "owners manage private meanings"
  on public.private_meanings;
drop policy if exists "owners read private meanings"
  on public.private_meanings;
drop policy if exists "admins read private submission meanings"
  on public.private_meanings;
drop policy if exists "owners insert private meanings"
  on public.private_meanings;
drop policy if exists "owners update private meanings"
  on public.private_meanings;
drop policy if exists "owners delete private meanings"
  on public.private_meanings;

drop policy if exists "owners manage decks" on public.decks;
drop policy if exists "owners read decks" on public.decks;
drop policy if exists "owners insert decks" on public.decks;
drop policy if exists "owners update decks" on public.decks;
drop policy if exists "owners delete decks" on public.decks;

drop policy if exists "owners manage tags" on public.tags;
drop policy if exists "owners read tags" on public.tags;
drop policy if exists "owners insert tags" on public.tags;
drop policy if exists "owners update tags" on public.tags;
drop policy if exists "owners delete tags" on public.tags;

drop policy if exists "owners manage vocabulary"
  on public.personal_vocabulary;
drop policy if exists "owners read vocabulary"
  on public.personal_vocabulary;
drop policy if exists "owners insert vocabulary"
  on public.personal_vocabulary;
drop policy if exists "owners update vocabulary"
  on public.personal_vocabulary;
drop policy if exists "owners delete vocabulary"
  on public.personal_vocabulary;

drop policy if exists "owners manage vocabulary tags"
  on public.personal_word_tags;
drop policy if exists "owners read vocabulary tags"
  on public.personal_word_tags;
drop policy if exists "owners insert vocabulary tags"
  on public.personal_word_tags;
drop policy if exists "owners update vocabulary tags"
  on public.personal_word_tags;
drop policy if exists "owners delete vocabulary tags"
  on public.personal_word_tags;

drop policy if exists "owners manage study scope" on public.study_scope;
drop policy if exists "owners read study scope" on public.study_scope;
drop policy if exists "owners insert study scope" on public.study_scope;
drop policy if exists "owners update study scope" on public.study_scope;
drop policy if exists "owners delete study scope" on public.study_scope;

drop policy if exists "owners manage learning cards"
  on public.learning_cards;
drop policy if exists "owners read learning cards" on public.learning_cards;
drop policy if exists "owners insert learning cards" on public.learning_cards;
drop policy if exists "owners update learning cards" on public.learning_cards;
drop policy if exists "owners delete learning cards" on public.learning_cards;

drop policy if exists "owners manage sessions" on public.study_sessions;
drop policy if exists "owners read sessions" on public.study_sessions;
drop policy if exists "owners insert sessions" on public.study_sessions;
drop policy if exists "owners transition active sessions"
  on public.study_sessions;

drop policy if exists "owners manage attempts" on public.study_attempts;
drop policy if exists "owners read attempts" on public.study_attempts;
drop policy if exists "owners insert attempts" on public.study_attempts;

-- Global content is active-only for learners. Admins can see archived rows and
-- mutate Global content through the same authenticated browser client.
create policy "authenticated read global words"
on public.global_words
for select
to authenticated
using (
  status = 'active'
  or (select private.is_admin())
);

create policy "admins insert global words"
on public.global_words
for insert
to authenticated
with check ((select private.is_admin()));

create policy "admins update global words"
on public.global_words
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins delete global words"
on public.global_words
for delete
to authenticated
using ((select private.is_admin()));

create policy "authenticated read global meanings"
on public.global_meanings
for select
to authenticated
using (
  (select private.is_admin())
  or (
    status = 'active'
    and exists (
      select 1
      from public.global_words word
      where word.id = global_meanings.global_word_id
        and word.status = 'active'
    )
  )
);

create policy "admins insert global meanings"
on public.global_meanings
for insert
to authenticated
with check ((select private.is_admin()));

create policy "admins update global meanings"
on public.global_meanings
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins delete global meanings"
on public.global_meanings
for delete
to authenticated
using ((select private.is_admin()));

create policy "authenticated read global examples"
on public.global_examples
for select
to authenticated
using (
  (select private.is_admin())
  or (
    status = 'active'
    and exists (
      select 1
      from public.global_meanings meaning
      join public.global_words word on word.id = meaning.global_word_id
      where meaning.id = global_examples.global_meaning_id
        and meaning.status = 'active'
        and word.status = 'active'
    )
  )
);

create policy "admins insert global examples"
on public.global_examples
for insert
to authenticated
with check ((select private.is_admin()));

create policy "admins update global examples"
on public.global_examples
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins delete global examples"
on public.global_examples
for delete
to authenticated
using ((select private.is_admin()));

create policy "authenticated read word parts"
on public.word_parts
for select
to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.global_words word
    where word.id = word_parts.global_word_id
      and word.status = 'active'
  )
);

create policy "admins insert word parts"
on public.word_parts
for insert
to authenticated
with check ((select private.is_admin()));

create policy "admins update word parts"
on public.word_parts
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "admins delete word parts"
on public.word_parts
for delete
to authenticated
using ((select private.is_admin()));

-- A learner controls content fields on their own Private Word. Moderation
-- fields remain unchanged unless an admin policy authorizes the update.
create policy "owners read private words"
on public.private_words
for select
to authenticated
using (owner_user_id = (select auth.uid()));

create policy "admins read private word submissions"
on public.private_words
for select
to authenticated
using ((select private.is_admin()));

create policy "owners insert private words"
on public.private_words
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and status = 'pending'
  and submission_version = 1
  and admin_comment is null
  and merged_global_word_id is null
);

create policy "owners update private words"
on public.private_words
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  (
    select private.learner_private_word_update_is_safe(
      id,
      owner_user_id,
      status,
      submission_version,
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
with check ((select private.is_admin()));

create policy "owners delete private words"
on public.private_words
for delete
to authenticated
using (owner_user_id = (select auth.uid()));

create policy "owners read private meanings"
on public.private_meanings
for select
to authenticated
using (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
  )
);

create policy "admins read private submission meanings"
on public.private_meanings
for select
to authenticated
using ((select private.is_admin()));

create policy "owners insert private meanings"
on public.private_meanings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
  )
);

create policy "owners update private meanings"
on public.private_meanings
for update
to authenticated
using (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
  )
);

create policy "owners delete private meanings"
on public.private_meanings
for delete
to authenticated
using (
  exists (
    select 1
    from public.private_words word
    where word.id = private_meanings.private_word_id
      and word.owner_user_id = (select auth.uid())
  )
);

create policy "owners read decks"
on public.decks
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert decks"
on public.decks
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "owners update decks"
on public.decks
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "owners delete decks"
on public.decks
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "owners read tags"
on public.tags
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert tags"
on public.tags
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "owners update tags"
on public.tags
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "owners delete tags"
on public.tags
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "owners read vocabulary"
on public.personal_vocabulary
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert vocabulary"
on public.personal_vocabulary
for insert
to authenticated
with check (
  (
    select private.personal_vocabulary_references_are_valid(
      user_id,
      global_word_id,
      private_word_id,
      deck_id
    )
  )
);

create policy "owners update vocabulary"
on public.personal_vocabulary
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  (
    select private.personal_vocabulary_references_are_valid(
      user_id,
      global_word_id,
      private_word_id,
      deck_id
    )
  )
);

create policy "owners delete vocabulary"
on public.personal_vocabulary
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "owners read vocabulary tags"
on public.personal_word_tags
for select
to authenticated
using (
  exists (
    select 1
    from public.personal_vocabulary vocabulary
    where vocabulary.id = personal_word_tags.personal_vocabulary_id
      and vocabulary.user_id = (select auth.uid())
  )
);

create policy "owners insert vocabulary tags"
on public.personal_word_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.personal_vocabulary vocabulary
    where vocabulary.id = personal_word_tags.personal_vocabulary_id
      and vocabulary.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.tags
    where tags.id = personal_word_tags.tag_id
      and tags.user_id = (select auth.uid())
  )
);

create policy "owners update vocabulary tags"
on public.personal_word_tags
for update
to authenticated
using (
  exists (
    select 1
    from public.personal_vocabulary vocabulary
    where vocabulary.id = personal_word_tags.personal_vocabulary_id
      and vocabulary.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.personal_vocabulary vocabulary
    where vocabulary.id = personal_word_tags.personal_vocabulary_id
      and vocabulary.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.tags
    where tags.id = personal_word_tags.tag_id
      and tags.user_id = (select auth.uid())
  )
);

create policy "owners delete vocabulary tags"
on public.personal_word_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.personal_vocabulary vocabulary
    where vocabulary.id = personal_word_tags.personal_vocabulary_id
      and vocabulary.user_id = (select auth.uid())
  )
);

create policy "owners read study scope"
on public.study_scope
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert study scope"
on public.study_scope
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (
    select private.study_scope_references_are_owned(
      active_deck_ids,
      excluded_tag_ids,
      paused_word_ids
    )
  )
);

create policy "owners update study scope"
on public.study_scope
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (
    select private.study_scope_references_are_owned(
      active_deck_ids,
      excluded_tag_ids,
      paused_word_ids
    )
  )
);

create policy "owners delete study scope"
on public.study_scope
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "owners read learning cards"
on public.learning_cards
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert learning cards"
on public.learning_cards
for insert
to authenticated
with check (
  (
    select private.learning_card_references_are_valid(
      user_id,
      personal_vocabulary_id,
      meaning_source_id,
      meaning_source_type
    )
  )
);

create policy "owners update learning cards"
on public.learning_cards
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  (
    select private.learning_card_references_are_valid(
      user_id,
      personal_vocabulary_id,
      meaning_source_id,
      meaning_source_type
    )
  )
);

create policy "owners delete learning cards"
on public.learning_cards
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "owners read sessions"
on public.study_sessions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert sessions"
on public.study_sessions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'active'
  and ended_at is null
);

create policy "owners transition active sessions"
on public.study_sessions
for update
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'active'
)
with check (
  (
    select private.learner_study_session_transition_is_valid(
      id,
      user_id,
      started_at,
      ended_at,
      scope_snapshot,
      review_limit,
      new_word_limit,
      status
    )
  )
);

create policy "owners read attempts"
on public.study_attempts
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners insert attempts"
on public.study_attempts
for insert
to authenticated
with check (
  (
    select private.study_attempt_references_are_owned(
      user_id,
      learning_card_id,
      session_id
    )
  )
);
