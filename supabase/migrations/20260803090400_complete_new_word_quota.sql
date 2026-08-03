-- The previous migration now defines completion-based quota semantics.
-- This migration upgrades databases that already applied the old reservation schema.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_new_word_usage'
      and column_name = 'reserved_count'
  ) then
    alter table public.daily_new_word_usage
      rename column reserved_count to completed_count;
  end if;
end
$$;

drop function if exists public.reserve_new_word_quota(uuid, date, integer, integer);
