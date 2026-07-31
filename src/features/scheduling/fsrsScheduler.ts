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
  recognition_score?: number;
  recall_score?: number;
  spelling_score?: number;
  context_score?: number;
  word_structure_score?: number;
  response_time_sample_count?: number;
  response_time_average_ms?: number;
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

export type FsrsProfile = {
  requestRetention: 0.9;
  learningSteps: ['10m' | '15m', '1d'];
  relearningSteps: ['10m' | '15m'];
};

export function deriveFsrsProfile(
  responseTimeAverageMs = 0,
  responseTimeSampleCount = 0,
): FsrsProfile {
  const slow = responseTimeSampleCount >= 3 && responseTimeAverageMs > 10_000;
  return {
    requestRetention: 0.9,
    learningSteps: [slow ? '15m' : '10m', '1d'],
    relearningSteps: [slow ? '15m' : '10m'],
  };
}

function createScheduler(profile: FsrsProfile) {
  return fsrs({
    request_retention: profile.requestRetention,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: profile.learningSteps,
    relearning_steps: profile.relearningSteps,
  });
}

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
    recognition_score: 0,
    recall_score: 0,
    spelling_score: 0,
    context_score: 0,
    word_structure_score: 0,
    response_time_sample_count: 0,
    response_time_average_ms: 0,
  };
}

export function scheduleCard(
  row: LearningCardFsrsRow,
  rating: AutomaticRating,
  reviewedAt: Date,
): ScheduledLearningCard {
  const card = learningCardRowToFsrsCard(row, reviewedAt);
  const profile = deriveFsrsProfile(row.response_time_average_ms, row.response_time_sample_count);
  const scheduler = createScheduler(profile);
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
    persistence: {
      ...fsrsCardToLearningCardUpdate(scheduled, retrievability, rating),
      recognition_score: row.recognition_score ?? 0,
      recall_score: row.recall_score ?? 0,
      spelling_score: row.spelling_score ?? 0,
      context_score: row.context_score ?? 0,
      word_structure_score: row.word_structure_score ?? 0,
      response_time_sample_count: row.response_time_sample_count ?? 0,
      response_time_average_ms: row.response_time_average_ms ?? 0,
    },
  };
}
