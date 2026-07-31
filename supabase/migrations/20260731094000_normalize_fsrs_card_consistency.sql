-- FSRS is the source of truth for card lifecycle.
-- A New card has never been reviewed and must not retain a legacy review date.
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

-- A non-New card without a review timestamp is also inconsistent. Reset it
-- instead of inventing a review date.
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

alter table public.learning_cards
  add constraint learning_cards_new_state_consistency
  check (fsrs_state <> 0 or last_reviewed_at is null);
