alter table public.learning_cards
  add column fsrs_state_version smallint not null default 1,
  add column fsrs_state smallint not null default 0,
  add column fsrs_stability double precision not null default 0,
  add column fsrs_difficulty double precision not null default 0,
  add column fsrs_elapsed_days integer not null default 0,
  add column fsrs_scheduled_days integer not null default 0,
  add column fsrs_learning_steps integer not null default 0,
  add column fsrs_reps integer not null default 0,
  add column fsrs_lapses integer not null default 0,
  add column fsrs_retrievability double precision not null default 1,
  add constraint learning_cards_fsrs_state_version_check
    check (fsrs_state_version = 1),
  add constraint learning_cards_fsrs_state_check
    check (fsrs_state between 0 and 3),
  add constraint learning_cards_fsrs_stability_check
    check (fsrs_stability >= 0),
  add constraint learning_cards_fsrs_difficulty_check
    check (fsrs_difficulty between 0 and 10),
  add constraint learning_cards_fsrs_elapsed_days_check
    check (fsrs_elapsed_days >= 0),
  add constraint learning_cards_fsrs_scheduled_days_check
    check (fsrs_scheduled_days >= 0),
  add constraint learning_cards_fsrs_learning_steps_check
    check (fsrs_learning_steps between 0 and 10),
  add constraint learning_cards_fsrs_reps_check
    check (fsrs_reps >= 0),
  add constraint learning_cards_fsrs_lapses_check
    check (fsrs_lapses >= 0 and fsrs_lapses <= fsrs_reps),
  add constraint learning_cards_fsrs_retrievability_check
    check (fsrs_retrievability between 0 and 1);

-- Preserve legacy review progress without claiming an exact FSRS history.
-- The first FSRS review will replace these conservative seed values.
update public.learning_cards
set
  fsrs_state = 2,
  fsrs_stability = greatest(review_interval_days::double precision, 0.1),
  fsrs_difficulty = 5,
  fsrs_elapsed_days = greatest(review_interval_days, 0),
  fsrs_scheduled_days = greatest(review_interval_days, 0),
  fsrs_reps = 1,
  fsrs_retrievability = least(
    1,
    greatest(0, memory_score::double precision / 100)
  )
where last_reviewed_at is not null;

comment on column public.learning_cards.fsrs_state_version is
  'Application-owned persisted FSRS card-state schema version.';
comment on column public.learning_cards.fsrs_state is
  'ts-fsrs State enum: 0 New, 1 Learning, 2 Review, 3 Relearning.';
comment on column public.learning_cards.fsrs_retrievability is
  'Recall probability at the timestamp when this state was last scheduled.';

-- Keep the browser Data API boundary explicit. Existing owner policies continue
-- to restrict every operation to user_id = auth.uid().
alter table public.learning_cards enable row level security;
revoke all privileges on table public.learning_cards from public, anon;
grant select, insert, update, delete
  on table public.learning_cards
  to authenticated;
