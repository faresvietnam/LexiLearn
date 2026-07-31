create table if not exists public.daily_new_word_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  reserved_count integer not null default 0 check (reserved_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, study_date)
);

alter table public.daily_new_word_usage enable row level security;
revoke all on table public.daily_new_word_usage from anon;
grant select, insert, update on table public.daily_new_word_usage to authenticated;

drop policy if exists "daily new word usage owner read" on public.daily_new_word_usage;
create policy "daily new word usage owner read"
  on public.daily_new_word_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "daily new word usage owner insert" on public.daily_new_word_usage;
create policy "daily new word usage owner insert"
  on public.daily_new_word_usage for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "daily new word usage owner update" on public.daily_new_word_usage;
create policy "daily new word usage owner update"
  on public.daily_new_word_usage for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.reserve_new_word_quota(
  requested_user_id uuid,
  requested_study_date date,
  daily_limit integer,
  requested_count integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  reserved integer;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> requested_user_id
     or daily_limit < 0 or requested_count < 0 then
    return 0;
  end if;

  insert into public.daily_new_word_usage(user_id, study_date)
  values (requested_user_id, requested_study_date)
  on conflict (user_id, study_date) do nothing;

  update public.daily_new_word_usage
  set reserved_count = reserved_count + requested_count,
      updated_at = now()
  where user_id = requested_user_id
    and study_date = requested_study_date
    and reserved_count + requested_count <= daily_limit
  returning reserved_count into reserved;

  if not found then return 0; end if;
  return requested_count;
end;
$$;

revoke all on function public.reserve_new_word_quota(uuid, date, integer, integer) from public, anon;
grant execute on function public.reserve_new_word_quota(uuid, date, integer, integer) to authenticated;
