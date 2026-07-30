import {describe, expect, it} from 'vitest';
import {State} from 'ts-fsrs';
import {
  fsrsCardToLearningCardUpdate,
  learningCardRowToFsrsCard,
  scheduleCard,
  type LearningCardFsrsRow,
} from './fsrsScheduler';

const reviewedAt = new Date('2026-07-30T05:00:00.000Z');

const newCardRow: LearningCardFsrsRow = {
  id: 'card-1',
  next_review_at: null,
  last_reviewed_at: null,
  fsrs_state_version: 1,
  fsrs_state: State.New,
  fsrs_stability: 0,
  fsrs_difficulty: 0,
  fsrs_elapsed_days: 0,
  fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0,
  fsrs_reps: 0,
  fsrs_lapses: 0,
  fsrs_retrievability: 1,
};

const reviewCardRow: LearningCardFsrsRow = {
  ...newCardRow,
  next_review_at: reviewedAt.toISOString(),
  last_reviewed_at: '2026-07-20T05:00:00.000Z',
  fsrs_state: State.Review,
  fsrs_stability: 10,
  fsrs_difficulty: 5,
  fsrs_elapsed_days: 10,
  fsrs_scheduled_days: 10,
  fsrs_reps: 4,
};

describe('FSRS scheduler adapter', () => {
  it('maps a new persisted row to the complete FSRS card state', () => {
    const card = learningCardRowToFsrsCard(newCardRow, reviewedAt);

    expect(card).toEqual({
      due: reviewedAt,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      last_review: undefined,
    });
  });

  it('puts a new card rated Again on the ten-minute learning step', () => {
    const scheduled = scheduleCard(newCardRow, 'Again', reviewedAt);

    expect(scheduled.card.state).toBe(State.Learning);
    expect(scheduled.card.due.getTime() - reviewedAt.getTime()).toBe(10 * 60_000);
    expect(scheduled.card.reps).toBe(1);
    expect(scheduled.card.stability).toBeGreaterThan(0);
    expect(scheduled.card.difficulty).toBeGreaterThan(0);
  });

  it('advances a new card rated Good to the one-day learning step', () => {
    const scheduled = scheduleCard(newCardRow, 'Good', reviewedAt);

    expect(scheduled.card.state).toBe(State.Review);
    expect(scheduled.card.due.getTime() - reviewedAt.getTime()).toBe(24 * 60 * 60_000);
    expect(scheduled.persistence.fsrs_learning_steps).toBe(1);
  });

  it('uses FSRS to keep a recalled review card in review with a future due date', () => {
    const scheduled = scheduleCard(reviewCardRow, 'Good', reviewedAt);

    expect(scheduled.card.state).toBe(State.Review);
    expect(scheduled.card.scheduled_days).toBe(32);
    expect(scheduled.card.due.toISOString()).toBe('2026-08-31T05:00:00.000Z');
    expect(scheduled.card.stability).toBeGreaterThan(reviewCardRow.fsrs_stability);
    expect(scheduled.card.reps).toBe(reviewCardRow.fsrs_reps + 1);
    expect(scheduled.retrievability).toBeGreaterThanOrEqual(0);
    expect(scheduled.retrievability).toBeLessThanOrEqual(1);
  });

  it('puts a forgotten review card on the ten-minute relearning step', () => {
    const scheduled = scheduleCard(reviewCardRow, 'Again', reviewedAt);

    expect(scheduled.card.state).toBe(State.Relearning);
    expect(scheduled.card.due.getTime() - reviewedAt.getTime()).toBe(10 * 60_000);
    expect(scheduled.card.lapses).toBe(reviewCardRow.fsrs_lapses + 1);
  });

  it('serializes due, retrievability, and the full FSRS state for persistence', () => {
    const scheduled = scheduleCard(reviewCardRow, 'Good', reviewedAt);
    const persistence = fsrsCardToLearningCardUpdate(
      scheduled.card,
      scheduled.retrievability,
    );

    expect(persistence).toEqual(scheduled.persistence);
    expect(persistence.next_review_at).toBe(scheduled.card.due.toISOString());
    expect(persistence.last_reviewed_at).toBe(reviewedAt.toISOString());
    expect(persistence.review_interval_days).toBe(scheduled.card.scheduled_days);
    expect(persistence.memory_score).toBe(
      Math.round(scheduled.retrievability * 100),
    );

    const recovered = learningCardRowToFsrsCard(
      {...reviewCardRow, ...persistence},
      reviewedAt,
    );
    expect(recovered).toEqual(scheduled.card);
  });
});
