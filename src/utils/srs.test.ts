import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeaningCard } from '../types';
import { evaluateSrsAttempt } from './srs';

const card: MeaningCard = {
  id: 'meaning-1',
  wordId: 'word-1',
  meaning: 'một nghĩa',
  partOfSpeech: 'noun',
  exampleSentences: [],
  memoryStrength: 'stable',
  memoryScore: 70,
  reviewIntervalDays: 12,
  nextReviewDate: '2026-07-20',
  firstAttemptErrorRate: 0,
  forgottenWordParts: [],
  history: [],
};

describe('evaluateSrsAttempt', () => {
  afterEach(() => vi.useRealTimers());

  it('appends history and resets an incorrect first attempt to a one-day interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));

    const result = evaluateSrsAttempt(card, 3, false, 2, 1, 8_000, ['Replacement']);

    expect(result.updatedCard.history).toHaveLength(1);
    expect(result.updatedCard.history[0]).toMatchObject({
      stage: 3,
      isFirstAttemptCorrect: false,
      attemptsCount: 2,
      hintLevelUsed: 1,
      responseTimeMs: 8_000,
      errorTypes: ['Replacement'],
    });
    expect(result.updatedCard.reviewIntervalDays).toBe(1);
    expect(result.updatedCard.nextReviewDate).toBe('2026-07-30');
  });

  it('raises score, interval, and strength after a successful fast recall', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));

    const result = evaluateSrsAttempt(card, 3, true, 1, 0, 1_000, []);

    expect(result.scoreChange).toBe(26);
    expect(result.updatedCard.memoryScore).toBe(96);
    expect(result.updatedCard.memoryStrength).toBe('strong');
    expect(result.updatedCard.reviewIntervalDays).toBe(22);
    expect(result.updatedCard.nextReviewDate).toBe('2026-08-20');
    expect(result.updatedCard.history).toHaveLength(1);
    expect(result.updatedCard.history[0]).toMatchObject({
      isFirstAttemptCorrect: true,
      attemptsCount: 1,
      responseTimeMs: 1_000,
      errorTypes: [],
    });
  });
});
