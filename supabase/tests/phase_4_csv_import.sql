do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'csv_imports'
  ) then
    raise exception 'csv_imports table is missing';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'csv_import_rows'
  ) then
    raise exception 'csv_import_rows table is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.csv_imports'::regclass) then
    raise exception 'csv_imports must retain RLS';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.csv_import_rows'::regclass) then
    raise exception 'csv_import_rows must retain RLS';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.csv_import_rows'::regclass
      and contype = 'u'
      and conname = 'csv_import_rows_import_id_canonical_key_key'
  ) then
    raise exception 'csv import rows must be idempotent by canonical key';
  end if;
end
$$;
