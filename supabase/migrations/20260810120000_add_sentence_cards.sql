create table public.sentence_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  image_url text not null,
  image_object_key text not null,
  english_sentence text not null,
  vietnamese_sentence text not null,
  created_at timestamptz not null default now(),

  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  review_interval_days integer not null default 0,
  fsrs_state_version smallint not null default 1,
  fsrs_state smallint not null default 0,
  fsrs_stability double precision not null default 0,
  fsrs_difficulty double precision not null default 0,
  fsrs_elapsed_days integer not null default 0,
  fsrs_scheduled_days integer not null default 0,
  fsrs_learning_steps integer not null default 0,
  fsrs_reps integer not null default 0,
  fsrs_lapses integer not null default 0,
  fsrs_retrievability double precision not null default 1,

  constraint sentence_cards_fsrs_state_version_check
    check (fsrs_state_version = 1),
  constraint sentence_cards_fsrs_state_check
    check (fsrs_state between 0 and 3),
  constraint sentence_cards_fsrs_stability_check
    check (fsrs_stability >= 0),
  constraint sentence_cards_fsrs_difficulty_check
    check (fsrs_difficulty between 0 and 10),
  constraint sentence_cards_fsrs_elapsed_days_check
    check (fsrs_elapsed_days >= 0),
  constraint sentence_cards_fsrs_scheduled_days_check
    check (fsrs_scheduled_days >= 0),
  constraint sentence_cards_fsrs_learning_steps_check
    check (fsrs_learning_steps between 0 and 10),
  constraint sentence_cards_fsrs_reps_check
    check (fsrs_reps >= 0),
  constraint sentence_cards_fsrs_lapses_check
    check (fsrs_lapses >= 0 and fsrs_lapses <= fsrs_reps),
  constraint sentence_cards_fsrs_retrievability_check
    check (fsrs_retrievability between 0 and 1)
);

create index sentence_cards_owner_next_review_idx
  on public.sentence_cards (owner_user_id, next_review_at);

alter table public.sentence_cards enable row level security;
revoke all privileges on table public.sentence_cards from public, anon;
grant select, insert, update, delete
  on table public.sentence_cards
  to authenticated;

create policy sentence_cards_owner_all on public.sentence_cards
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
