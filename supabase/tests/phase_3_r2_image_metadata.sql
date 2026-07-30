do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'private_words'
      and column_name = 'image_object_key'
      and data_type = 'text'
      and is_nullable = 'YES'
  ) then
    raise exception 'private_words.image_object_key must be nullable text';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.private_words'::regclass
      and conname = 'private_words_image_object_key_scope_check'
      and contype = 'c'
      and convalidated
  ) then
    raise exception 'R2 object keys must have a validated ownership constraint';
  end if;

  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.private_words'::regclass
  ) then
    raise exception 'private_words must retain RLS';
  end if;
end
$$;
