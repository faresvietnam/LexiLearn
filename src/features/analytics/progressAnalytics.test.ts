import {describe, expect, it} from 'vitest';
import type {MeaningCard, Word} from '../../types';
import {calculateProgressAnalytics} from './progressAnalytics';

const meaning = (id: string, overrides: Partial<MeaningCard> = {}): MeaningCard => ({
  id,
  wordId: `word-${id}`,
  meaning: id,
  partOfSpeech: 'noun',
  exampleSentences: [],
  memoryStrength: 'strong',
  memoryScore: 80,
  fsrsState: 2,
  fsrsRetrievability: 0.8,
  reviewIntervalDays: 2,
  nextReviewDate: '2026-08-03T00:00:00.000Z',
  firstAttemptErrorRate: 0,
  forgottenWordParts: [],
  history: [],
  ...overrides,
});

const word = (id: string, meanings: MeaningCard[], overrides: Partial<Word> = {}): Word => ({
  id,
  word: id,
  wordStructure: [],
  wordFamily: [],
  isGlobal: false,
  approvalStatus: 'approved',
  createdBy: 'user-1',
  createdAt: '2026-08-01',
  deckId: 'deck-1',
  tags: [],
  status: 'active',
  meanings,
  ...overrides,
});

const attempt = (cardId: string, overrides: Partial<{
  is_correct: boolean;
  first_attempt: boolean;
  response_time_ms: number | null;
  hint_level: number;
  answer_revealed: boolean;
  created_at: string;
}> = {}) => ({
  learning_card_id: cardId,
  is_correct: true,
  first_attempt: true,
  response_time_ms: 2000,
  hint_level: 0,
  answer_revealed: false,
  created_at: '2026-08-01T05:00:00.000Z',
  ...overrides,
});

describe('calculateProgressAnalytics', () => {
  it('filters cards by active Study Scope and counts FSRS states', () => {
    const result = calculateProgressAnalytics([
      word('new', [meaning('new', {fsrsState: 0, fsrsRetrievability: 1})]),
      word('paused', [meaning('paused', {fsrsState: 2})], {status: 'paused'}),
      word('outside', [meaning('outside')], {deckId: 'other'}),
      word('review', [meaning('review', {fsrsState: 2, fsrsRetrievability: 0.7})]),
    ], [], new Date('2026-08-01T06:00:00.000Z'), 'Asia/Ho_Chi_Minh', {
      activeDeckIds: ['deck-1'],
      excludedTagIds: [],
      pausedWordIds: [],
    });

    expect(result.totalCards).toBe(2);
    expect(result.stateCounts).toEqual({new: 1, learning: 0, review: 1, relearning: 0});
    expect(result.predictedRetention).toBe(70);
  });

  it('calculates observed accuracy and interaction rates from attempts', () => {
    const result = calculateProgressAnalytics(
      [word('remember', [meaning('card-1')])],
      [
        attempt('card-1'),
        attempt('card-1', {is_correct: false, first_attempt: true, hint_level: 1}),
        attempt('card-1', {is_correct: true, first_attempt: false, response_time_ms: 4000, answer_revealed: true}),
      ],
      new Date('2026-08-01T06:00:00.000Z'),
    );

    expect(result.firstAttemptAccuracy).toBe(50);
    expect(result.overallAccuracy).toBe(67);
    expect(result.retryRate).toBe(33);
    expect(result.hintRate).toBe(33);
    expect(result.revealRate).toBe(33);
    expect(result.averageResponseTimeMs).toBe(2667);
  });

  it('uses the 04:00 local study date for activity buckets', () => {
    const result = calculateProgressAnalytics(
      [word('remember', [meaning('card-1')])],
      [attempt('card-1', {created_at: '2026-07-31T20:30:00.000Z'})],
      new Date('2026-08-01T06:00:00.000Z'),
      'Asia/Ho_Chi_Minh',
    );

    expect(result.activity.find(({studyDate}) => studyDate === '2026-07-31')?.attempts).toBe(1);
  });
});
