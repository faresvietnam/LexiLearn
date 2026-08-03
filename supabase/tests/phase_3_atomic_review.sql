do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'review_events'
  ) then
    raise exception 'review_events table is missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.review_events'::regclass) then
    raise exception 'review_events must retain RLS';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.review_events'::regclass
      and contype = 'u'
      and conname = 'review_events_user_id_idempotency_key_key'
  ) then
    raise exception 'review events must be idempotent per user';
  end if;

  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'submit_learning_review'
  ) then
    raise exception 'submit_learning_review RPC is missing';
  end if;
end
$$;
