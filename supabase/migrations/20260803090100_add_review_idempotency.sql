create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  learning_card_id uuid not null references public.learning_cards(id) on delete cascade,
  idempotency_key text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create index if not exists review_events_session_idx
  on public.review_events(session_id, created_at desc);
create index if not exists review_events_card_idx
  on public.review_events(learning_card_id, created_at desc);

alter table public.review_events enable row level security;
revoke all privileges on table public.review_events from public, anon;
grant select, insert on public.review_events to authenticated;

drop policy if exists "owners read review events" on public.review_events;
create policy "owners read review events"
  on public.review_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "owners insert review events" on public.review_events;
create policy "owners insert review events"
  on public.review_events for insert to authenticated
  with check (user_id = (select auth.uid()));
