-- Development-only reset: preserve vocabulary and cards, discard review history.
delete from public.study_attempts;
delete from public.study_sessions;

-- FSRS is the source of truth. New cards must not retain legacy review dates.
update public.learning_cards
set
  last_reviewed_at = null,
  next_review_at = null,
  review_interval_days = 1,
  memory_strength = 'critical',
  memory_score = 0,
  fsrs_stability = 0,
  fsrs_difficulty = 0,
  fsrs_elapsed_days = 0,
  fsrs_scheduled_days = 0,
  fsrs_learning_steps = 0,
  fsrs_reps = 0,
  fsrs_lapses = 0,
  fsrs_retrievability = 1
where fsrs_state = 0;

-- In development data, a non-New card without a review timestamp is invalid.
update public.learning_cards
set
  fsrs_state = 0,
  last_reviewed_at = null,
  next_review_at = null,
  review_interval_days = 1,
  memory_strength = 'critical',
  memory_score = 0,
  fsrs_stability = 0,
  fsrs_difficulty = 0,
  fsrs_elapsed_days = 0,
  fsrs_scheduled_days = 0,
  fsrs_learning_steps = 0,
  fsrs_reps = 0,
  fsrs_lapses = 0,
  fsrs_retrievability = 1
where fsrs_state <> 0 and last_reviewed_at is null;

-- Keep this invariant enforced for all future writes.
alter table public.learning_cards
  drop constraint if exists learning_cards_new_state_consistency;
alter table public.learning_cards
  add constraint learning_cards_new_state_consistency
  check (fsrs_state <> 0 or last_reviewed_at is null);
