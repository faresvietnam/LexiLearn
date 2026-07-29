-- Run after the Phase 2 identity migration. This is intentionally read-only
-- against existing users and asserts the public security contract.
do $$
declare
  configured_limit integer;
begin
  select integer_value into configured_limit
  from public.app_settings
  where key = 'gemini_auto_fill_daily_limit';
  if configured_limit <> 10 then
    raise exception 'Expected gemini_auto_fill_daily_limit = 10, got %', configured_limit;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users'
  ) then
    raise exception 'RLS policies missing for public.users';
  end if;
end;
$$;
