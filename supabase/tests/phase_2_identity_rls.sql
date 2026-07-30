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
    raise sqlstate 'PT001';
  exception
    when insufficient_privilege then
      return;
    when sqlstate 'PT001' then
      insert into phase_2_test_failures (failure) values (failure_message);
      return;
  end;
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
    if affected_rows <> 0 then
      raise sqlstate 'PT002';
    end if;
  exception
    when insufficient_privilege then
      return;
    when sqlstate 'PT002' then
      insert into phase_2_test_failures (failure) values (failure_message);
      return;
  end;
end;
$$;

create or replace function pg_temp.phase_2_expect_foreign_key_rejected(
  statement text,
  failure_message text
)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    raise sqlstate 'PT003';
  exception
    when foreign_key_violation then
      return;
    when sqlstate 'PT003' then
      insert into phase_2_test_failures (failure) values (failure_message);
      return;
  end;
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

select pg_temp.phase_2_assert(
  not has_table_privilege('authenticated', 'public.users', 'UPDATE')
  and has_column_privilege(
    'authenticated',
    'public.users',
    'display_name',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.users',
    'avatar_url',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.users',
    'timezone',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.users',
    'study_day_starts_at',
    'UPDATE'
  ),
  'profiles must expose only the intended editable columns'
);

select pg_temp.phase_2_assert(
  not has_column_privilege(
    'authenticated',
    'public.users',
    'id',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.users',
    'email',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.users',
    'created_at',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.users',
    'updated_at',
    'UPDATE'
  ),
  'profile identity and audit columns must not be user-editable'
);

select pg_temp.phase_2_assert(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and (
        grantee = 'anon'
        or privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
        or (
          table_name = 'users'
          and privilege_type not in ('SELECT')
        )
        or (
          table_name = 'user_roles'
          and privilege_type not in ('SELECT')
        )
        or (
          table_name = 'user_settings'
          and privilege_type not in ('SELECT', 'UPDATE')
        )
        or (
          table_name = 'app_settings'
          and privilege_type not in ('SELECT', 'UPDATE')
        )
        or (
          table_name = 'ai_auto_fill_usage'
          and privilege_type not in ('SELECT')
        )
      )
      and table_name in (
        'users',
        'user_roles',
        'user_settings',
        'app_settings',
        'ai_auto_fill_usage'
      )
  ),
  'identity tables must expose only their intended authenticated operations'
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

update public.users
set display_name = 'Learner A',
    avatar_url = 'https://example.invalid/learner-a.png',
    timezone = 'UTC',
    study_day_starts_at = time '05:00'
where id = '00000000-0000-4000-8000-000000000101';

select pg_temp.phase_2_assert(
  (
    select
      display_name = 'Learner A'
      and avatar_url = 'https://example.invalid/learner-a.png'
      and timezone = 'UTC'
      and study_day_starts_at = time '05:00'
    from public.users
    where id = '00000000-0000-4000-8000-000000000101'
  ),
  'learners must retain updates to allowed profile fields'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    update public.users
    set email = 'forged@example.invalid'
    where id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'learners must not update profile email'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    update public.users
    set id = '00000000-0000-4000-8000-000000000199'
    where id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'learners must not update profile identity'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    update public.users
    set created_at = now() - interval '1 year'
    where id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'learners must not update profile creation time'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    update public.users
    set updated_at = now() - interval '1 year'
    where id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'learners must not directly update profile audit time'
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

insert into public.private_words (
  id,
  owner_user_id,
  word,
  normalized_word
)
values (
  '00000000-0000-4000-8000-000000000323',
  '00000000-0000-4000-8000-000000000101',
  'Learner A approved private',
  'learner a approved private'
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

insert into public.private_meanings (
  id,
  private_word_id,
  meaning_vi,
  part_of_speech
)
values (
  '00000000-0000-4000-8000-000000000333',
  '00000000-0000-4000-8000-000000000323',
  'riêng A được duyệt',
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

update public.private_meanings
set meaning_vi = 'riêng A đã sửa'
where id = '00000000-0000-4000-8000-000000000331';

select pg_temp.phase_2_assert(
  (
    select meaning_vi = 'riêng A đã sửa'
    from public.private_meanings
    where id = '00000000-0000-4000-8000-000000000331'
  ),
  'learners must retain safe edits to meanings of pending private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_words
    set created_at = now() - interval '1 year'
    where id = '00000000-0000-4000-8000-000000000321'
  $statement$,
  'learners must not alter private-word creation time'
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

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.personal_vocabulary
    set private_word_id = '00000000-0000-4000-8000-000000000322'
    where id = '00000000-0000-4000-8000-000000000341'
  $statement$,
  'personal vocabulary updates must reject another owner''s private word'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.personal_vocabulary
    set deck_id = '00000000-0000-4000-8000-000000000302'
    where id = '00000000-0000-4000-8000-000000000341'
  $statement$,
  'personal vocabulary updates must reject another owner''s deck'
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

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.personal_word_tags
    set tag_id = '00000000-0000-4000-8000-000000000312'
    where personal_vocabulary_id =
      '00000000-0000-4000-8000-000000000341'
      and tag_id = '00000000-0000-4000-8000-000000000311'
  $statement$,
  'personal vocabulary tag updates must reject another owner''s tag'
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

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.learning_cards
    set personal_vocabulary_id =
          '00000000-0000-4000-8000-000000000342',
        meaning_source_id = '00000000-0000-4000-8000-000000000332'
    where id = '00000000-0000-4000-8000-000000000351'
  $statement$,
  'learning card updates must reject another owner''s vocabulary'
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
      '00000000-0000-4000-8000-000000000351',
      '00000000-0000-4000-8000-000000000365',
      'fill_blank',
      2,
      false,
      false,
      900
    )
  $statement$,
  'study attempts must reject another owner''s session'
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
      '00000000-0000-4000-8000-000000000364',
      'fill_blank',
      3,
      false,
      false,
      950
    )
  $statement$,
  'study attempts must reject another owner''s learning card'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.study_scope (user_id, active_deck_ids)
    values (
      '00000000-0000-4000-8000-000000000101',
      array['00000000-0000-4000-8000-000000000302']::uuid[]
    )
  $statement$,
  'study scope inserts must reject another owner''s deck'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.study_scope (user_id, excluded_tag_ids)
    values (
      '00000000-0000-4000-8000-000000000101',
      array['00000000-0000-4000-8000-000000000312']::uuid[]
    )
  $statement$,
  'study scope inserts must reject another owner''s tag'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.study_scope (user_id, paused_word_ids)
    values (
      '00000000-0000-4000-8000-000000000101',
      array['00000000-0000-4000-8000-000000000342']::uuid[]
    )
  $statement$,
  'study scope inserts must reject another owner''s vocabulary'
);

insert into public.study_scope (
  user_id,
  active_deck_ids,
  excluded_tag_ids,
  paused_word_ids
)
values (
  '00000000-0000-4000-8000-000000000101',
  array['00000000-0000-4000-8000-000000000301']::uuid[],
  array['00000000-0000-4000-8000-000000000311']::uuid[],
  array['00000000-0000-4000-8000-000000000341']::uuid[]
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_scope
    set active_deck_ids =
      array['00000000-0000-4000-8000-000000000302']::uuid[],
        excluded_tag_ids =
          array['00000000-0000-4000-8000-000000000311']::uuid[],
        paused_word_ids =
          array['00000000-0000-4000-8000-000000000341']::uuid[]
    where user_id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'study scope updates must reject another owner''s deck'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_scope
    set active_deck_ids =
          array['00000000-0000-4000-8000-000000000301']::uuid[],
        excluded_tag_ids =
      array['00000000-0000-4000-8000-000000000312']::uuid[],
        paused_word_ids =
          array['00000000-0000-4000-8000-000000000341']::uuid[]
    where user_id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'study scope updates must reject another owner''s tag'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.study_scope
    set active_deck_ids =
          array['00000000-0000-4000-8000-000000000301']::uuid[],
        excluded_tag_ids =
          array['00000000-0000-4000-8000-000000000311']::uuid[],
        paused_word_ids =
      array['00000000-0000-4000-8000-000000000342']::uuid[]
    where user_id = '00000000-0000-4000-8000-000000000101'
  $statement$,
  'study scope updates must reject another owner''s vocabulary'
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

update public.private_words
set status = 'approved', admin_comment = 'Approved'
where id = '00000000-0000-4000-8000-000000000323';

select pg_temp.phase_2_assert(
  (
    select status = 'rejected' and admin_comment = 'Needs revision'
    from public.private_words
    where id = '00000000-0000-4000-8000-000000000321'
  ),
  'admins must be able to moderate private-word submissions'
);

select pg_temp.phase_2_assert(
  (
    select status = 'approved' and admin_comment = 'Approved'
    from public.private_words
    where id = '00000000-0000-4000-8000-000000000323'
  ),
  'admins must be able to approve private-word submissions'
);

reset role;

-- Rejected and approved learner content is immutable, including its meanings.
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

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_words
    set word = 'Rejected learner edit'
    where id = '00000000-0000-4000-8000-000000000321'
  $statement$,
  'learners must not edit rejected private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_words
    set word = 'Approved learner edit'
    where id = '00000000-0000-4000-8000-000000000323'
  $statement$,
  'learners must not edit approved private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_meanings
    set meaning_vi = 'rejected learner meaning edit'
    where id = '00000000-0000-4000-8000-000000000331'
  $statement$,
  'learners must not edit meanings of rejected private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_meanings
    set meaning_vi = 'approved learner meaning edit'
    where id = '00000000-0000-4000-8000-000000000333'
  $statement$,
  'learners must not edit meanings of approved private words'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.private_meanings (
      private_word_id,
      meaning_vi,
      part_of_speech,
      display_order
    )
    values (
      '00000000-0000-4000-8000-000000000321',
      'new rejected meaning',
      'noun',
      9
    )
  $statement$,
  'learners must not add meanings to rejected private words'
);

select pg_temp.phase_2_expect_rejected(
  $statement$
    insert into public.private_meanings (
      private_word_id,
      meaning_vi,
      part_of_speech,
      display_order
    )
    values (
      '00000000-0000-4000-8000-000000000323',
      'new approved meaning',
      'noun',
      9
    )
  $statement$,
  'learners must not add meanings to approved private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    delete from public.private_meanings
    where id = '00000000-0000-4000-8000-000000000331'
  $statement$,
  'learners must not delete meanings of rejected private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    delete from public.private_meanings
    where id = '00000000-0000-4000-8000-000000000333'
  $statement$,
  'learners must not delete meanings of approved private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    delete from public.private_words
    where id = '00000000-0000-4000-8000-000000000321'
  $statement$,
  'learners must not delete rejected private words'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    delete from public.private_words
    where id = '00000000-0000-4000-8000-000000000323'
  $statement$,
  'learners must not delete approved private words'
);

reset role;

-- An immutable attempt must keep its learning-card reference. Deleting a card
-- with attempt history must be rejected rather than applying ON DELETE SET NULL.
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

select pg_temp.phase_2_expect_foreign_key_rejected(
  $statement$
    delete from public.learning_cards
    where id = '00000000-0000-4000-8000-000000000351'
  $statement$,
  'learning cards referenced by attempts must not be deleted'
);

select pg_temp.phase_2_assert(
  (
    select learning_card_id = '00000000-0000-4000-8000-000000000351'
    from public.study_attempts
    where id = '00000000-0000-4000-8000-000000000371'
  ),
  'deleting a learning card must not null an immutable attempt reference'
);

reset role;

-- Admin moderation can change moderation fields only, never ownership or the
-- learner-authored word/meaning content.
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

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_words
    set word = 'Admin content rewrite'
    where id = '00000000-0000-4000-8000-000000000321'
  $statement$,
  'admins must not alter learner-authored private-word content'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_words
    set owner_user_id = '00000000-0000-4000-8000-000000000102'
    where id = '00000000-0000-4000-8000-000000000323'
  $statement$,
  'admins must not change private-word ownership'
);

select pg_temp.phase_2_expect_no_rows_affected(
  $statement$
    update public.private_meanings
    set meaning_vi = 'Admin meaning rewrite'
    where id = '00000000-0000-4000-8000-000000000331'
  $statement$,
  'admins must not alter learner-authored private meanings'
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
