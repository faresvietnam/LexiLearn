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
    where table_schema = 'public' and table_name = 'edit_suggestions'
  ) then
    raise exception 'edit_suggestions table is missing';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_audit_logs'
  ) then
    raise exception 'admin_audit_logs table is missing';
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
  if not (select relrowsecurity from pg_class where oid = 'public.edit_suggestions'::regclass) then
    raise exception 'edit_suggestions must retain RLS';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.admin_audit_logs'::regclass) then
    raise exception 'admin_audit_logs must retain RLS';
  end if;
  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'moderate_private_word'
  ) then
    raise exception 'moderate_private_word RPC is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'learning_cards'
      and column_name = 'fsrs_state'
  ) then
    raise exception 'learning_cards.fsrs_state is missing';
  end if;
end
$$;
