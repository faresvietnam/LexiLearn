create or replace function public.submit_learning_review(
  p_session_id uuid,
  p_learning_card_id uuid,
  p_idempotency_key text,
  p_is_new_word boolean,
  p_study_date date,
  p_daily_limit integer,
  p_attempts jsonb,
  p_schedule jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_existing_result jsonb;
  v_card jsonb;
  v_attempt jsonb;
  v_previous_state smallint;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_attempts) <> 'array' or jsonb_array_length(p_attempts) = 0 then
    raise exception 'attempts must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'schedule must be an object' using errcode = '22023';
  end if;
  if p_daily_limit < 0 then
    raise exception 'daily limit must be non-negative' using errcode = '22023';
  end if;

  perform 1
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user_id
    and status in ('active', 'paused')
  for update;
  if not found then
    raise exception 'study session not found' using errcode = '42501';
  end if;

  perform 1
  from public.learning_cards
  where id = p_learning_card_id
    and user_id = v_user_id
  for update;
  if not found then
    raise exception 'learning card not found' using errcode = '42501';
  end if;

  select fsrs_state into v_previous_state
  from public.learning_cards
  where id = p_learning_card_id and user_id = v_user_id;

  insert into public.review_events (
    user_id, session_id, learning_card_id, idempotency_key
  ) values (
    v_user_id, p_session_id, p_learning_card_id, p_idempotency_key
  ) on conflict (user_id, idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select result into v_existing_result
    from public.review_events
    where user_id = v_user_id and idempotency_key = p_idempotency_key;
    if v_existing_result is null then
      raise exception 'review is already being submitted' using errcode = '40001';
    end if;
    return v_existing_result;
  end if;

  if p_is_new_word and v_previous_state = 0 then
    insert into public.daily_new_word_usage(user_id, study_date, completed_count)
    values (v_user_id, p_study_date, 0)
    on conflict (user_id, study_date) do nothing;

    update public.daily_new_word_usage
    set completed_count = completed_count + 1,
        updated_at = now()
    where user_id = v_user_id
      and study_date = p_study_date
      and completed_count + 1 <= p_daily_limit;
    if not found then
      raise exception 'daily new word limit reached' using errcode = '22023';
    end if;
  end if;

  for v_attempt in select value from jsonb_array_elements(p_attempts)
  loop
    if v_attempt->>'learning_card_id' <> p_learning_card_id::text
      or coalesce((v_attempt->>'attempt_number')::integer, 0) < 1
      or coalesce((v_attempt->>'response_time_ms')::integer, -1) < 0 then
      raise exception 'invalid attempt payload' using errcode = '22023';
    end if;

    insert into public.study_attempts (
      user_id, session_id, learning_card_id, question_type, input_mode,
      attempt_number, submitted_answer, is_correct, first_attempt,
      response_time_ms, hint_level, answer_revealed, error_types, sentence_key
    ) values (
      v_user_id, p_session_id, p_learning_card_id,
      v_attempt->>'question_type', v_attempt->>'input_mode',
      (v_attempt->>'attempt_number')::integer, v_attempt->>'submitted_answer',
      coalesce((v_attempt->>'is_correct')::boolean, false),
      coalesce((v_attempt->>'first_attempt')::boolean, false),
      (v_attempt->>'response_time_ms')::integer,
      coalesce((v_attempt->>'hint_level')::integer, 0),
      coalesce((v_attempt->>'answer_revealed')::boolean, false),
      coalesce(array(select jsonb_array_elements_text(v_attempt->'error_types')), '{}'),
      v_attempt->>'sentence_key'
    );
  end loop;

  if coalesce((p_schedule->>'fsrs_state')::smallint, -1) not between 0 and 3
    or coalesce((p_schedule->>'fsrs_retrievability')::double precision, -1) not between 0 and 1 then
    raise exception 'invalid FSRS schedule' using errcode = '22023';
  end if;

  update public.learning_cards
  set
    next_review_at = nullif(p_schedule->>'next_review_at', '')::timestamptz,
    last_reviewed_at = nullif(p_schedule->>'last_reviewed_at', '')::timestamptz,
    review_interval_days = (p_schedule->>'review_interval_days')::integer,
    memory_score = (p_schedule->>'memory_score')::integer,
    memory_strength = p_schedule->>'memory_strength',
    fsrs_state_version = (p_schedule->>'fsrs_state_version')::smallint,
    fsrs_state = (p_schedule->>'fsrs_state')::smallint,
    fsrs_stability = (p_schedule->>'fsrs_stability')::double precision,
    fsrs_difficulty = (p_schedule->>'fsrs_difficulty')::double precision,
    fsrs_elapsed_days = (p_schedule->>'fsrs_elapsed_days')::integer,
    fsrs_scheduled_days = (p_schedule->>'fsrs_scheduled_days')::integer,
    fsrs_learning_steps = (p_schedule->>'fsrs_learning_steps')::integer,
    fsrs_reps = (p_schedule->>'fsrs_reps')::integer,
    fsrs_lapses = (p_schedule->>'fsrs_lapses')::integer,
    fsrs_retrievability = (p_schedule->>'fsrs_retrievability')::double precision,
    recognition_score = coalesce((p_schedule->>'recognition_score')::integer, recognition_score),
    recall_score = coalesce((p_schedule->>'recall_score')::integer, recall_score),
    spelling_score = coalesce((p_schedule->>'spelling_score')::integer, spelling_score),
    context_score = coalesce((p_schedule->>'context_score')::integer, context_score),
    word_structure_score = coalesce((p_schedule->>'word_structure_score')::integer, word_structure_score),
    response_time_sample_count = coalesce((p_schedule->>'response_time_sample_count')::integer, response_time_sample_count),
    response_time_average_ms = coalesce((p_schedule->>'response_time_average_ms')::integer, response_time_average_ms)
  where id = p_learning_card_id and user_id = v_user_id
  returning jsonb_build_object(
    'id', id,
    'next_review_at', next_review_at,
    'last_reviewed_at', last_reviewed_at,
    'fsrs_state', fsrs_state,
    'fsrs_reps', fsrs_reps,
    'fsrs_lapses', fsrs_lapses,
    'fsrs_retrievability', fsrs_retrievability
  ) into v_card;

  if v_card is null then
    raise exception 'learning card update failed';
  end if;

  v_existing_result = jsonb_build_object('event_id', v_event_id, 'card', v_card);
  update public.review_events set result = v_existing_result where id = v_event_id;
  return v_existing_result;
end;
$$;

revoke all on function public.submit_learning_review(uuid, uuid, text, boolean, date, integer, jsonb, jsonb) from public, anon;
grant execute on function public.submit_learning_review(uuid, uuid, text, boolean, date, integer, jsonb, jsonb) to authenticated;
