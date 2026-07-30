do $$
declare
  missing_columns text[];
  missing_constraints text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing_columns
  from (
    values
      ('fsrs_state_version'),
      ('fsrs_state'),
      ('fsrs_stability'),
      ('fsrs_difficulty'),
      ('fsrs_elapsed_days'),
      ('fsrs_scheduled_days'),
      ('fsrs_learning_steps'),
      ('fsrs_reps'),
      ('fsrs_lapses'),
      ('fsrs_retrievability')
  ) as expected(name)
  where not exists (
    select 1
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'learning_cards'
      and column_info.column_name = expected.name
      and column_info.is_nullable = 'NO'
  );

  if missing_columns is not null then
    raise exception 'missing required FSRS columns: %', missing_columns;
  end if;

  select array_agg(expected.name order by expected.name)
  into missing_constraints
  from (
    values
      ('learning_cards_fsrs_state_version_check'),
      ('learning_cards_fsrs_state_check'),
      ('learning_cards_fsrs_stability_check'),
      ('learning_cards_fsrs_difficulty_check'),
      ('learning_cards_fsrs_elapsed_days_check'),
      ('learning_cards_fsrs_scheduled_days_check'),
      ('learning_cards_fsrs_learning_steps_check'),
      ('learning_cards_fsrs_reps_check'),
      ('learning_cards_fsrs_lapses_check'),
      ('learning_cards_fsrs_retrievability_check')
  ) as expected(name)
  where not exists (
    select 1
    from pg_catalog.pg_constraint constraint_info
    where constraint_info.conrelid = 'public.learning_cards'::regclass
      and constraint_info.conname = expected.name
      and constraint_info.contype = 'c'
      and constraint_info.convalidated
  );

  if missing_constraints is not null then
    raise exception 'missing validated FSRS constraints: %', missing_constraints;
  end if;

  if not (
    select table_info.relrowsecurity
    from pg_catalog.pg_class table_info
    where table_info.oid = 'public.learning_cards'::regclass
  ) then
    raise exception 'learning_cards must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.learning_cards', 'select')
    or has_table_privilege('anon', 'public.learning_cards', 'insert')
    or has_table_privilege('anon', 'public.learning_cards', 'update')
    or has_table_privilege('anon', 'public.learning_cards', 'delete') then
    raise exception 'anon must not have learning_cards privileges';
  end if;

  if not has_table_privilege(
    'authenticated', 'public.learning_cards', 'select'
  )
    or not has_table_privilege(
      'authenticated', 'public.learning_cards', 'insert'
    )
    or not has_table_privilege(
      'authenticated', 'public.learning_cards', 'update'
    )
    or not has_table_privilege(
      'authenticated', 'public.learning_cards', 'delete'
    ) then
    raise exception 'authenticated is missing learning_cards privileges';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policies policy_info
    where policy_info.schemaname = 'public'
      and policy_info.tablename = 'learning_cards'
      and policy_info.roles = array['authenticated']::name[]
      and policy_info.policyname in (
        'owners read learning cards',
        'owners insert learning cards',
        'owners update learning cards',
        'owners delete learning cards'
      )
  ) <> 4 then
    raise exception 'learning_cards owner RLS policies are incomplete';
  end if;

  if exists (
    select 1
    from public.learning_cards
    where fsrs_state_version <> 1
      or fsrs_state not between 0 and 3
      or fsrs_stability < 0
      or fsrs_difficulty not between 0 and 10
      or fsrs_elapsed_days < 0
      or fsrs_scheduled_days < 0
      or fsrs_learning_steps not between 0 and 10
      or fsrs_reps < 0
      or fsrs_lapses not between 0 and fsrs_reps
      or fsrs_retrievability not between 0 and 1
  ) then
    raise exception 'learning_cards contains invalid FSRS state';
  end if;
end
$$;
