import {
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs';
import type {AutomaticRating} from './automaticRating';
import type {MemoryStrength} from '../../types';

export const FSRS_STATE_VERSION = 1 as const;

export interface LearningCardFsrsRow {
  id: string;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  fsrs_state_version: typeof FSRS_STATE_VERSION;
  fsrs_state: State;
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_learning_steps: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_retrievability: number;
}

export type LearningCardScheduleUpdate = Omit<LearningCardFsrsRow, 'id'> & {
  review_interval_days: number;
  memory_score: number;
  memory_strength: MemoryStrength;
};

export interface ScheduledLearningCard {
  card: Card;
  retrievability: number;
  persistence: LearningCardScheduleUpdate;
}

export function deriveMemoryStrength(
  card: Card,
  retrievability: number,
  rating: AutomaticRating,
): MemoryStrength {
  if (rating === 'Again' || card.state === State.Relearning) return 'critical';
  if (card.state === State.New || card.state === State.Learning) return 'weak';

  const score = Math.round(Math.max(0, Math.min(1, retrievability)) * 100);
  if (score >= 80) return 'strong';
  if (score >= 50) return 'stable';
  if (score >= 25) return 'weak';
  return 'critical';
}

const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['10m', '1d'],
  relearning_steps: ['10m'],
});

const ratingMap: Record<AutomaticRating, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

export function learningCardRowToFsrsCard(
  row: LearningCardFsrsRow,
  now = new Date(),
): Card {
  return {
    due: row.next_review_at ? new Date(row.next_review_at) : now,
    stability: row.fsrs_stability,
    difficulty: row.fsrs_difficulty,
    elapsed_days: row.fsrs_elapsed_days,
    scheduled_days: row.fsrs_scheduled_days,
    learning_steps: row.fsrs_learning_steps,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    state: row.fsrs_state,
    last_review: row.last_reviewed_at
      ? new Date(row.last_reviewed_at)
      : undefined,
  };
}

export function fsrsCardToLearningCardUpdate(
  card: Card,
  retrievability: number,
  rating: AutomaticRating = 'Good',
): LearningCardScheduleUpdate {
  return {
    next_review_at: card.due.toISOString(),
    last_reviewed_at: card.last_review?.toISOString() ?? null,
    review_interval_days: card.scheduled_days,
    memory_score: Math.round(retrievability * 100),
    memory_strength: deriveMemoryStrength(card, retrievability, rating),
    fsrs_state_version: FSRS_STATE_VERSION,
    fsrs_state: card.state,
    fsrs_stability: card.stability,
    fsrs_difficulty: card.difficulty,
    fsrs_elapsed_days: card.elapsed_days,
    fsrs_scheduled_days: card.scheduled_days,
    fsrs_learning_steps: card.learning_steps,
    fsrs_reps: card.reps,
    fsrs_lapses: card.lapses,
    fsrs_retrievability: retrievability,
  };
}

export function scheduleCard(
  row: LearningCardFsrsRow,
  rating: AutomaticRating,
  reviewedAt: Date,
): ScheduledLearningCard {
  const card = learningCardRowToFsrsCard(row, reviewedAt);
  const scheduled = scheduler.next(card, reviewedAt, ratingMap[rating]).card;
  // Persist the predicted recall at the next due timestamp, not immediately
  // after review (which is always 1.0 by definition).
  const retrievability = scheduler.get_retrievability(
    scheduled,
    scheduled.due,
    false,
  );

  return {
    card: scheduled,
    retrievability,
    persistence: fsrsCardToLearningCardUpdate(scheduled, retrievability, rating),
  };
}
