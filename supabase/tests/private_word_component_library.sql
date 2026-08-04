-- Run after all migrations. Every fixture is rolled back.
begin;

set local statement_timeout = '60s';

insert into auth.users (
  id, instance_id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'component-a@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'component-b@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000501',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);

select public.create_private_word(jsonb_build_object(
  'owner_user_id', '00000000-0000-4000-8000-000000000501',
  'word', 'component',
  'normalized_word', 'component',
  'ipa', null,
  'audio_url', null,
  'image_url', null,
  'image_object_key', null,
  'deck_id', null,
  'study_status', 'active',
  'tag_ids', '[]'::jsonb,
  'meanings', jsonb_build_array(jsonb_build_object(
    'meaning_vi', 'thành phần',
    'part_of_speech', 'noun',
    'definition_en', 'one part of a larger whole',
    'examples', '[]'::jsonb
  )),
  'parts', jsonb_build_array(
    jsonb_build_object(
      'text', 'Com-',
      'type', 'prefix',
      'meaning', 'together'
    ),
    jsonb_build_object(
      'text', 'pon',
      'type', 'root',
      'meaning', 'put'
    )
  )
));

select public.create_private_word(jsonb_build_object(
  'owner_user_id', '00000000-0000-4000-8000-000000000501',
  'word', 'compose',
  'normalized_word', 'compose',
  'ipa', null,
  'audio_url', null,
  'image_url', null,
  'image_object_key', null,
  'deck_id', null,
  'study_status', 'active',
  'tag_ids', '[]'::jsonb,
  'meanings', jsonb_build_array(jsonb_build_object(
    'meaning_vi', 'soạn',
    'part_of_speech', 'verb',
    'definition_en', null,
    'examples', '[]'::jsonb
  )),
  'parts', jsonb_build_array(
    jsonb_build_object(
      'text', 'com',
      'type', 'prefix',
      'meaning', 'must not overwrite'
    ),
    jsonb_build_object(
      'text', 'COM',
      'type', 'root',
      'meaning', 'a root with the same text'
    )
  )
));

do $$
declare
  prefix_count integer;
  root_count integer;
  stored_meaning text;
begin
  select count(*), min(meaning)
  into prefix_count, stored_meaning
  from public.private_word_components
  where owner_user_id = '00000000-0000-4000-8000-000000000501'
    and type = 'prefix'
    and normalized_text = 'com';

  select count(*)
  into root_count
  from public.private_word_components
  where owner_user_id = '00000000-0000-4000-8000-000000000501'
    and type = 'root'
    and normalized_text = 'com';

  if prefix_count <> 1 then
    raise exception 'same-owner prefix component was not reused';
  end if;
  if root_count <> 1 then
    raise exception 'same text with a different type must be distinct';
  end if;
  if stored_meaning <> 'together' then
    raise exception 'reuse overwrote an existing non-empty meaning';
  end if;
end
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000502',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated"}',
  true
);

select public.create_private_word(jsonb_build_object(
  'owner_user_id', '00000000-0000-4000-8000-000000000502',
  'word', 'company',
  'normalized_word', 'company',
  'ipa', null,
  'audio_url', null,
  'image_url', null,
  'image_object_key', null,
  'deck_id', null,
  'study_status', 'active',
  'tag_ids', '[]'::jsonb,
  'meanings', jsonb_build_array(jsonb_build_object(
    'meaning_vi', 'công ty',
    'part_of_speech', 'noun',
    'definition_en', null,
    'examples', '[]'::jsonb
  )),
  'parts', jsonb_build_array(jsonb_build_object(
    'text', 'com-',
    'type', 'prefix',
    'meaning', 'together'
  ))
));

do $$
declare
  other_owner_count integer;
begin
  select count(*)
  into other_owner_count
  from public.private_word_components
  where owner_user_id = '00000000-0000-4000-8000-000000000502'
    and type = 'prefix'
    and normalized_text = 'com';

  if other_owner_count <> 1 then
    raise exception 'components must be isolated by owner';
  end if;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'private_meanings'
      and policyname ilike '%pending private meanings%'
  ) then
    raise exception 'obsolete pending-only private meaning policy remains';
  end if;
end
$$;

-- A statement-level exception must roll back every row created inside the RPC.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000501',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.create_private_word(jsonb_build_object(
      'owner_user_id', '00000000-0000-4000-8000-000000000501',
      'word', 'invalid atomic word',
      'normalized_word', 'invalid atomic word',
      'study_status', 'active',
      'tag_ids', '[]'::jsonb,
      'meanings', jsonb_build_array(
        jsonb_build_object(
          'meaning_vi', 'hợp lệ',
          'part_of_speech', 'adjective',
          'examples', '[]'::jsonb
        ),
        jsonb_build_object(
          'meaning_vi', '',
          'part_of_speech', 'noun',
          'examples', '[]'::jsonb
        )
      ),
      'parts', '[]'::jsonb
    ));
    raise exception 'invalid meaning was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  if exists (
    select 1
    from public.private_words
    where owner_user_id = '00000000-0000-4000-8000-000000000501'
      and normalized_word = 'invalid atomic word'
  ) then
    raise exception 'failed RPC left a partial private word';
  end if;
end
$$;

rollback;
