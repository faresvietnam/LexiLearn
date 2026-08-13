-- Add sentence_vi (Vietnamese translation of the example sentence itself,
-- distinct from meaning_vi which is the word's meaning) to private_examples.
-- global_examples already has this column since the original schema
-- migration (20260729171732) but the app never wired it up on either side;
-- this migration only needs to catch private_examples up.
alter table public.private_examples add column sentence_vi text;

create or replace function public.create_private_word(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_private_word public.private_words;
  v_vocabulary public.personal_vocabulary;
  v_meaning jsonb;
  v_meaning_row public.private_meanings;
  v_meaning_ids uuid[] := '{}';
  v_part jsonb;
  v_component public.private_word_components;
  v_example jsonb;
  v_tag_id uuid;
  v_normalized_component text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  begin
    v_owner_user_id := (p_payload->>'owner_user_id')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid owner_user_id' using errcode = '22023';
  end;

  if v_owner_user_id is distinct from v_user_id then
    raise exception 'owner mismatch' using errcode = '42501';
  end if;

  if nullif(btrim(p_payload->>'word'), '') is null
    or jsonb_typeof(p_payload->'meanings') <> 'array'
    or jsonb_array_length(p_payload->'meanings') = 0
    or coalesce(p_payload->>'study_status', 'active')
      not in ('active', 'paused', 'archived') then
    raise exception 'invalid private word payload' using errcode = '22023';
  end if;

  if nullif(p_payload->>'deck_id', '') is not null
    and not exists (
      select 1
      from public.decks
      where id = (p_payload->>'deck_id')::uuid
        and user_id = v_user_id
    ) then
    raise exception 'deck not owned by user' using errcode = '42501';
  end if;

  insert into public.private_words (
    owner_user_id,
    word,
    normalized_word,
    ipa,
    audio_url,
    image_url,
    image_object_key,
    status,
    admin_comment
  ) values (
    v_user_id,
    btrim(p_payload->>'word'),
    lower(btrim(p_payload->>'normalized_word')),
    nullif(btrim(p_payload->>'ipa'), ''),
    nullif(btrim(p_payload->>'audio_url'), ''),
    nullif(btrim(p_payload->>'image_url'), ''),
    nullif(btrim(p_payload->>'image_object_key'), ''),
    'approved',
    null
  )
  returning * into v_private_word;

  for v_meaning in
    select value
    from jsonb_array_elements(p_payload->'meanings')
    with ordinality as item(value, position)
    order by position
  loop
    if nullif(btrim(v_meaning->>'meaning_vi'), '') is null
      or nullif(btrim(v_meaning->>'part_of_speech'), '') is null
      or coalesce(jsonb_typeof(v_meaning->'examples'), 'array') <> 'array' then
      raise exception 'invalid meaning payload' using errcode = '22023';
    end if;

    insert into public.private_meanings (
      private_word_id,
      meaning_vi,
      part_of_speech,
      definition_en,
      display_order
    ) values (
      v_private_word.id,
      btrim(v_meaning->>'meaning_vi'),
      btrim(v_meaning->>'part_of_speech'),
      nullif(btrim(v_meaning->>'definition_en'), ''),
      coalesce(array_length(v_meaning_ids, 1), 0)
    )
    returning * into v_meaning_row;

    v_meaning_ids := array_append(v_meaning_ids, v_meaning_row.id);

    for v_example in
      select value
      from jsonb_array_elements(coalesce(v_meaning->'examples', '[]'::jsonb))
    loop
      if nullif(btrim(v_example->>'sentence'), '') is null then
        raise exception 'invalid example payload' using errcode = '22023';
      end if;

      insert into public.private_examples (
        private_meaning_id,
        sentence,
        sentence_vi,
        expected_answer,
        word_form,
        difficulty
      ) values (
        v_meaning_row.id,
        btrim(v_example->>'sentence'),
        nullif(btrim(v_example->>'sentence_vi'), ''),
        coalesce(
          nullif(btrim(v_example->>'expected_answer'), ''),
          v_private_word.word
        ),
        coalesce(nullif(btrim(v_example->>'word_form'), ''), 'base'),
        coalesce(nullif(btrim(v_example->>'difficulty'), ''), 'medium')
      );
    end loop;
  end loop;

  if coalesce(jsonb_typeof(p_payload->'parts'), 'array') <> 'array' then
    raise exception 'invalid parts payload' using errcode = '22023';
  end if;

  for v_part in
    select value
    from jsonb_array_elements(coalesce(p_payload->'parts', '[]'::jsonb))
    with ordinality as item(value, position)
    order by position
  loop
    v_normalized_component :=
      public.normalize_word_component(v_part->>'text');

    if nullif(v_normalized_component, '') is null
      or (v_part->>'type') not in (
        'prefix',
        'root',
        'base',
        'suffix',
        'combining_form',
        'compound_component'
      ) then
      raise exception 'invalid word component payload' using errcode = '22023';
    end if;

    insert into public.private_word_components (
      owner_user_id,
      type,
      normalized_text,
      display_text,
      meaning
    ) values (
      v_user_id,
      v_part->>'type',
      v_normalized_component,
      btrim(v_part->>'text'),
      nullif(btrim(v_part->>'meaning'), '')
    )
    on conflict (owner_user_id, type, normalized_text)
    do update set
      meaning = case
        when nullif(btrim(private_word_components.meaning), '') is null
          then excluded.meaning
        else private_word_components.meaning
      end,
      updated_at = case
        when nullif(btrim(private_word_components.meaning), '') is null
          and excluded.meaning is not null
          then now()
        else private_word_components.updated_at
      end
    returning * into v_component;

    insert into public.private_word_parts (
      private_word_id,
      component_id,
      text,
      type,
      meaning,
      position
    ) values (
      v_private_word.id,
      v_component.id,
      btrim(v_part->>'text'),
      v_part->>'type',
      nullif(btrim(v_part->>'meaning'), ''),
      (
        select count(*)
        from public.private_word_parts
        where private_word_id = v_private_word.id
      )
    );
  end loop;

  insert into public.personal_vocabulary (
    user_id,
    private_word_id,
    deck_id,
    study_status
  ) values (
    v_user_id,
    v_private_word.id,
    nullif(p_payload->>'deck_id', '')::uuid,
    coalesce(p_payload->>'study_status', 'active')
  )
  returning * into v_vocabulary;

  if coalesce(jsonb_typeof(p_payload->'tag_ids'), 'array') <> 'array' then
    raise exception 'invalid tag_ids payload' using errcode = '22023';
  end if;

  for v_tag_id in
    select value::uuid
    from jsonb_array_elements_text(coalesce(p_payload->'tag_ids', '[]'::jsonb))
  loop
    if not exists (
      select 1
      from public.tags
      where id = v_tag_id
        and user_id = v_user_id
    ) then
      raise exception 'tag not owned by user' using errcode = '42501';
    end if;

    insert into public.personal_word_tags (
      personal_vocabulary_id,
      tag_id
    ) values (
      v_vocabulary.id,
      v_tag_id
    );
  end loop;

  insert into public.learning_cards (
    user_id,
    personal_vocabulary_id,
    meaning_source_id,
    meaning_source_type
  )
  select
    v_user_id,
    v_vocabulary.id,
    meaning_id,
    'private_meaning'
  from unnest(v_meaning_ids) as meaning_id;

  select jsonb_build_object(
    'id', vocabulary.id,
    'deck_id', vocabulary.deck_id,
    'study_status', vocabulary.study_status,
    'added_at', vocabulary.added_at,
    'personal_word_tags', coalesce((
      select jsonb_agg(jsonb_build_object('tag_id', tag.tag_id))
      from public.personal_word_tags tag
      where tag.personal_vocabulary_id = vocabulary.id
    ), '[]'::jsonb),
    'learning_cards', coalesce((
      select jsonb_agg(to_jsonb(card) order by card.created_at, card.id)
      from public.learning_cards card
      where card.personal_vocabulary_id = vocabulary.id
    ), '[]'::jsonb),
    'global_words', null,
    'private_words', jsonb_build_object(
      'id', word.id,
      'owner_user_id', word.owner_user_id,
      'word', word.word,
      'ipa', word.ipa,
      'audio_url', word.audio_url,
      'image_url', word.image_url,
      'image_object_key', word.image_object_key,
      'status', word.status,
      'admin_comment', word.admin_comment,
      'submission_version', word.submission_version,
      'created_at', word.created_at,
      'private_word_parts', coalesce((
        select jsonb_agg(to_jsonb(part) order by part.position)
        from public.private_word_parts part
        where part.private_word_id = word.id
      ), '[]'::jsonb),
      'private_meanings', coalesce((
        select jsonb_agg(
          to_jsonb(meaning) || jsonb_build_object(
            'private_examples', coalesce((
              select jsonb_agg(to_jsonb(example) order by example.created_at)
              from public.private_examples example
              where example.private_meaning_id = meaning.id
            ), '[]'::jsonb)
          )
          order by meaning.display_order
        )
        from public.private_meanings meaning
        where meaning.private_word_id = word.id
      ), '[]'::jsonb)
    )
  )
  into v_result
  from public.personal_vocabulary vocabulary
  join public.private_words word on word.id = vocabulary.private_word_id
  where vocabulary.id = v_vocabulary.id;

  return v_result;
end;
$$;
