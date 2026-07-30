-- Run after all Phase 2 migrations. The transaction is always rolled back, so
-- the assertions are safe to replay against a linked or local project.
begin;

set local statement_timeout = '60s';

create temporary table phase_2_test_failures (
  failure text not null
) on commit drop;

grant select, insert on phase_2_test_failures to authenticated;

create or replace function pg_temp.phase_2_assert(
  condition boolean,
  failure_message text
)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    insert into phase_2_test_failures (failure) values (failure_message);
  end if;
end;
$$;

create or replace function pg_temp.phase_2_expect_rejected(
  statement text,
  failure_message text
)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when insufficient_privilege then
      return;
  end;

  insert into phase_2_test_failures (failure) values (failure_message);
end;
$$;

create or replace function pg_temp.phase_2_expect_no_rows_affected(
  statement text,
  failure_message text
)
returns void
language plpgsql
as $$
declare
  affected_rows bigint;
begin
  begin
    execute statement;
    get diagnostics affected_rows = row_count;
  exception
    when insufficient_privilege then
      return;
  end;

  if affected_rows <> 0 then
    insert into phase_2_test_failures (failure) values (failure_message);
  end if;
end;
$$;

-- Structural assertions catch accidental regressions without depending only on
-- the data-path checks below.
select pg_temp.phase_2_assert(
  to_regprocedure('public.is_admin()') is null,
  'public.is_admin() must be absent and safely droppable on replay'
);

select pg_temp.phase_2_assert(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'learner_private_word_update_is_safe'
      and not p.prosecdef
  ),
  'learner moderation protection must use a security-invoker helper'
);

select pg_temp.phase_2_assert(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'learner_study_session_transition_is_valid'
      and not p.prosecdef
  ),
  'session transitions must use a security-invoker helper'
);

select pg_temp.phase_2_assert(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and cmd = 'ALL'
      and tablename in (
        'global_words',
        'global_meanings',
        'global_examples',
        'word_parts',
        'private_words',
        'private_meanings',
        'decks',
        'tags',
        'personal_vocabulary',
        'personal_word_tags',
        'study_scope',
        'learning_cards',
        'study_sessions',
        'study_attempts'
      )
  ),
  'Phase 2 content policies must be operation-specific, not FOR ALL'
);

select pg_temp.phase_2_assert(
  not has_table_privilege(
    'authenticated',
    'public.study_attempts',
    'UPDATE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.study_attempts',
    'DELETE'
  ),
  'study_attempts must be append-only for authenticated users'
);

select pg_temp.phase_2_assert(
  has_table_privilege('authenticated', 'public.study_sessions', 'UPDATE')
  and not has_table_privilege(
    'authenticated',
    'public.study_sessions',
    'DELETE'
  ),
  'study_sessions must allow constrained updates but not deletion'
);

select pg_temp.phase_2_assert(
  (
    select bool_and(
      has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        privilege_name
      )
    )
    from unnest(
      array[
        'global_words',
        'global_meanings',
        'global_examples',
        'word_parts'
      ]
    ) as table_names(table_name)
    cross join unnest(
      array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    ) as privilege_names(privilege_name)
  ),
  'authenticated role needs DML grants so RLS can authorize Global admins'
);

select pg_temp.phase_2_assert(
  (
    select bool_and(
      not has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        privilege_name
      )
    )
    from unnest(
      array[
        'global_words',
        'global_meanings',
        'global_examples',
        'word_parts',
        'private_words',
        'private_meanings',
        'decks',
        'tags',
        'personal_vocabulary',
        'personal_word_tags',
        'study_scope',
        'learning_cards',
        'study_sessions',
        'study_attempts'
      ]
    ) as table_names(table_name)
    cross join unnest(
      array['TRUNCATE', 'REFERENCES', 'TRIGGER']
    ) as privilege_names(privilege_name)
  ),
  'authenticated users must not have non-DML table privileges'
);

-- Stable test identities and records are transaction-scoped and rolled back.
insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'phase2-rls-a@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'phase2-rls-b@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'authenticated',
    'authenticated',
    'phase2-rls-admin@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.user_roles (user_id, role)
values ('00000000-0000-4000-8000-000000000103', 'admin');

-- Admin Global writes must work through authenticated grants plus RLS.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);

insert into public.global_words (
  id,
  word,
  normalized_word,
  status,
  created_by_admin_id
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    'Phase 2 active',
    'phase 2 active',
    'active',
    '00000000-0000-4000-8000-000000000103'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    'Phase 2 archived',
    'phase 2 archived',
    'archived',
    '00000000-0000-4000-8000-000000000103'
  );

insert into public.global_meanings (
  id,
  global_word_id,
  meaning_vi,
  part_of_speech,
  display_order,
  status
)
values
  (
    '00000000-0000-4000-8000-000000000211',
    '00000000-0000-4000-8000-000000000201',
    'hiện',
    'adjective',
    0,
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000212',
    '00000000-0000-4000-8000-000000000201',
    'lưu trữ',
    'adjective',
    1,
    'archived'
  ),
  (
    '00000000-0000-4000-8000-000000000213',
    '00000000-0000-4000-8000-000000000202',
    'ẩn theo từ cha',
    'adjective',
    0,
    'active'
  );

insert into public.global_examples (
  id,
  global_meaning_id,
  sentence,
  expected_answer,
  status
)
values
  (
    '00000000-0000-4000-8000-000000000221',
    '00000000-0000-4000-8000-000000000211',
    'The active example is visible.',
    'active',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000222',
    '00000000-0000-4000-8000-000000000211',
    'The archived example is hidden.',
    'archived',
    'archived'
  ),
  (
    '00000000-0000-4000-8000-000000000223',
    '00000000-0000-4000-8000-000000000212',
    'The archived meaning hides this.',
    'meaning',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000224',
    '00000000-0000-4000-8000-000000000213',
    'The archived word hides this.',
    'word',
    'active'
  );

insert into public.word_parts (
  id,
  global_word_id,
  text,
  type,
  position
)
values
  (
    '00000000-0000-4000-8000-000000000231',
    '00000000-0000-4000-8000-000000000201',
    'act',
    'root',
    0
  ),
  (
    '00000000-0000-4000-8000-000000000232',
    '00000000-0000-4000-8000-000000000202',
    'arch',
    'root',
    0
  );

select pg_temp.phase_2_assert(
  (
    select count(*) = 3
    from public.global_meanings
    where id between
      '00000000-0000-4000-8000-000000000211'
      and '00000000-0000-4000-8000-000000000213'
  ),
  'admins must be able to read archived Global meanings'
);

reset role;

-- Learner A owns the first set of personal content.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);

select pg_temp.phase_2_assert(
  (
    select count(*) = 1
    from public.global_meanings
    where id between
      '00000000-0000-4000-8000-000000000211'
      and '00000000-0000-4000-8000-000000000213'
  ),
  'learners must see only active meanings of active Global words'
);

select pg_temp.phase_2_assert(
  (
    select count(*) = 1
    from public.global_examples
    where id between
      '00000000-0000-4000-8000-000000000221'
      and '00000000-0000-4000-8000-000000000224'
  ),
  'learners must see only active examples under active Global parents'
);

select pg_temp.phase_2_assert(
  (
    select count(*) = 1
    from public.word_parts
    where id between
      '00000000-0000-4000-8000-000000000231'
      and '00000000-0000-4000-8000-000000000232'
  ),
  'learners must see word parts only for active Global words'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.global_words (word, normalized_word)
    values ('Learner Global write', 'learner global write')
  $statement$,
  'learners must not insert Global words'
);

insert into public.decks (id, user_id, name)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  'Learner A deck'
);

insert into public.tags (id, user_id, name)
values (
  '00000000-0000-4000-8000-000000000311',
  '00000000-0000-4000-8000-000000000101',
  'Learner A tag'
);

insert into public.private_words (
  id,
  owner_user_id,
  word,
  normalized_word
)
values (
  '00000000-0000-4000-8000-000000000321',
  '00000000-0000-4000-8000-000000000101',
  'Learner A private',
  'learner a private'
);

insert into public.private_meanings (
  id,
  private_word_id,
  meaning_vi,
  part_of_speech
)
values (
  '00000000-0000-4000-8000-000000000331',
  '00000000-0000-4000-8000-000000000321',
  'riêng A',
  'adjective'
);

insert into public.personal_vocabulary (
  id,
  user_id,
  private_word_id,
  deck_id
)
values (
  '00000000-0000-4000-8000-000000000341',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000321',
  '00000000-0000-4000-8000-000000000301'
);

insert into public.personal_word_tags (
  personal_vocabulary_id,
  tag_id
)
values (
  '00000000-0000-4000-8000-000000000341',
  '00000000-0000-4000-8000-000000000311'
);

insert into public.learning_cards (
  id,
  user_id,
  personal_vocabulary_id,
  meaning_source_id,
  meaning_source_type
)
values (
  '00000000-0000-4000-8000-000000000351',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000341',
  '00000000-0000-4000-8000-000000000331',
  'private_meaning'
);

insert into public.study_sessions (
  id,
  user_id,
  review_limit,
  new_word_limit
)
values
  (
    '00000000-0000-4000-8000-000000000361',
    '00000000-0000-4000-8000-000000000101',
    40,
    10
  ),
  (
    '00000000-0000-4000-8000-000000000362',
    '00000000-0000-4000-8000-000000000101',
    40,
    10
  ),
  (
    '00000000-0000-4000-8000-000000000363',
    '00000000-0000-4000-8000-000000000101',
    40,
    10
  ),
  (
    '00000000-0000-4000-8000-000000000364',
    '00000000-0000-4000-8000-000000000101',
    40,
    10
  );

insert into public.study_attempts (
  id,
  user_id,
  learning_card_id,
  session_id,
  question_type,
  attempt_number,
  is_correct,
  first_attempt,
  response_time_ms
)
values (
  '00000000-0000-4000-8000-000000000371',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000351',
  '00000000-0000-4000-8000-000000000361',
  'fill_blank',
  1,
  true,
  true,
  1200
);

-- Attempts are append-only.
select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_attempts
    set submitted_answer = 'tampered'
    where id = '00000000-0000-4000-8000-000000000371'
  $statement$,
  'owners must not update study attempts'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    delete from public.study_attempts
    where id = '00000000-0000-4000-8000-000000000371'
  $statement$,
  'owners must not delete study attempts'
);

-- Only owner transitions from active to paused/completed are allowed.
update public.study_sessions
set status = 'paused'
where id = '00000000-0000-4000-8000-000000000361';

update public.study_sessions
set status = 'completed', ended_at = now()
where id = '00000000-0000-4000-8000-000000000362';

select pg_temp.phase_2_assert(
  (
    select count(*) = 2
    from public.study_sessions
    where (
      id = '00000000-0000-4000-8000-000000000361'
      and status = 'paused'
    )
    or (
      id = '00000000-0000-4000-8000-000000000362'
      and status = 'completed'
      and ended_at is not null
    )
  ),
  'owners must be able to pause or complete active sessions'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_sessions
    set status = 'active', ended_at = null
    where id = '00000000-0000-4000-8000-000000000362'
  $statement$,
  'completed sessions must not transition back to active'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_sessions
    set status = 'abandoned'
    where id = '00000000-0000-4000-8000-000000000363'
  $statement$,
  'owners must not transition active sessions to abandoned'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_sessions
    set scope_snapshot = '{"tampered":true}'::jsonb
    where id = '00000000-0000-4000-8000-000000000364'
  $statement$,
  'owners must not mutate immutable session fields'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    delete from public.study_sessions
    where id = '00000000-0000-4000-8000-000000000364'
  $statement$,
  'owners must not delete study sessions'
);

-- Learners may edit their content but never seed or alter moderation fields.
update public.private_words
set word = 'Learner A private edited',
    normalized_word = 'learner a private edited',
    submission_version = submission_version + 1
where id = '00000000-0000-4000-8000-000000000321';

select pg_temp.phase_2_assert(
  (
    select word = 'Learner A private edited' and submission_version = 2
    from public.private_words
    where id = '00000000-0000-4000-8000-000000000321'
  ),
  'learners must retain safe edits to their own private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_words
    set status = 'approved', admin_comment = 'self-approved'
    where id = '00000000-0000-4000-8000-000000000321'
  $statement$,
  'learners must not mutate private-word moderation fields'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.private_words (
      owner_user_id,
      word,
      normalized_word,
      status,
      admin_comment
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      'Self approved insert',
      'self approved insert',
      'approved',
      'spoofed'
    )
  $statement$,
  'learners must not seed moderation fields on private-word insert'
);

reset role;

-- Learner B owns the foreign references used by cross-owner rejection tests.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000102',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);

insert into public.decks (id, user_id, name)
values (
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000102',
  'Learner B deck'
);

insert into public.tags (id, user_id, name)
values (
  '00000000-0000-4000-8000-000000000312',
  '00000000-0000-4000-8000-000000000102',
  'Learner B tag'
);

insert into public.private_words (
  id,
  owner_user_id,
  word,
  normalized_word
)
values (
  '00000000-0000-4000-8000-000000000322',
  '00000000-0000-4000-8000-000000000102',
  'Learner B private',
  'learner b private'
);

insert into public.private_meanings (
  id,
  private_word_id,
  meaning_vi,
  part_of_speech
)
values (
  '00000000-0000-4000-8000-000000000332',
  '00000000-0000-4000-8000-000000000322',
  'riêng B',
  'adjective'
);

insert into public.personal_vocabulary (
  id,
  user_id,
  private_word_id,
  deck_id
)
values (
  '00000000-0000-4000-8000-000000000342',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000322',
  '00000000-0000-4000-8000-000000000302'
);

insert into public.learning_cards (
  id,
  user_id,
  personal_vocabulary_id,
  meaning_source_id,
  meaning_source_type
)
values (
  '00000000-0000-4000-8000-000000000352',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000342',
  '00000000-0000-4000-8000-000000000332',
  'private_meaning'
);

insert into public.study_sessions (
  id,
  user_id,
  review_limit,
  new_word_limit
)
values (
  '00000000-0000-4000-8000-000000000365',
  '00000000-0000-4000-8000-000000000102',
  40,
  10
);

reset role;

-- Learner A cannot attach Learner B's rows to Learner A records.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000101',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',
  true
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.personal_vocabulary (
      user_id,
      private_word_id
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000322'
    )
  $statement$,
  'personal vocabulary must reject another owner''s private word'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.personal_vocabulary (
      user_id,
      global_word_id,
      deck_id
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000302'
    )
  $statement$,
  'personal vocabulary must reject another owner''s deck'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.personal_word_tags (
      personal_vocabulary_id,
      tag_id
    )
    values (
      '00000000-0000-4000-8000-000000000341',
      '00000000-0000-4000-8000-000000000312'
    )
  $statement$,
  'personal vocabulary tags must reject another owner''s tag'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.learning_cards (
      user_id,
      personal_vocabulary_id,
      meaning_source_id,
      meaning_source_type
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000342',
      '00000000-0000-4000-8000-000000000332',
      'private_meaning'
    )
  $statement$,
  'learning cards must reject another owner''s vocabulary'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.study_attempts (
      user_id,
      learning_card_id,
      session_id,
      question_type,
      attempt_number,
      is_correct,
      first_attempt,
      response_time_ms
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000352',
      '00000000-0000-4000-8000-000000000365',
      'fill_blank',
      2,
      false,
      false,
      900
    )
  $statement$,
  'study attempts must reject another owner''s session or card'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.study_scope (
      user_id,
      active_deck_ids,
      excluded_tag_ids,
      paused_word_ids
    )
    values (
      '00000000-0000-4000-8000-000000000101',
      array['00000000-0000-4000-8000-000000000302']::uuid[],
      array['00000000-0000-4000-8000-000000000312']::uuid[],
      array['00000000-0000-4000-8000-000000000342']::uuid[]
    )
  $statement$,
  'study scope must reject another owner''s deck, tag, or vocabulary'
);

reset role;

-- Admins can read and moderate submissions; learners still own content edits.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000103',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',
  true
);

select pg_temp.phase_2_assert(
  exists (
    select 1
    from public.private_words
    where id = '00000000-0000-4000-8000-000000000321'
  )
  and exists (
    select 1
    from public.private_meanings
    where id = '00000000-0000-4000-8000-000000000331'
  ),
  'admins must be able to read private-word submissions and meanings'
);

update public.private_words
set status = 'rejected', admin_comment = 'Needs revision'
where id = '00000000-0000-4000-8000-000000000321';

select pg_temp.phase_2_assert(
  (
    select status = 'rejected' and admin_comment = 'Needs revision'
    from public.private_words
    where id = '00000000-0000-4000-8000-000000000321'
  ),
  'admins must be able to moderate private-word submissions'
);

reset role;

do $$
declare
  failures text;
begin
  select string_agg(
    format('%s. %s', failure_number, failure),
    E'\n'
    order by failure_number
  )
  into failures
  from (
    select row_number() over () as failure_number, failure
    from phase_2_test_failures
  ) numbered_failures;

  if failures is not null then
    raise exception E'Phase 2 RLS assertions failed:\n%', failures;
  end if;
end;
$$;

rollback;

select 'Phase 2 identity and RLS assertions passed' as result;
