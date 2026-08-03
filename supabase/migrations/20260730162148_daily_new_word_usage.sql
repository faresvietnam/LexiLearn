create table if not exists public.daily_new_word_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  completed_count integer not null default 0 check (completed_count >= 0),
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
