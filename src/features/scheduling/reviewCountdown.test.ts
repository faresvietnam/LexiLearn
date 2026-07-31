import {describe, expect, it} from 'vitest';
import type {Word} from '../../types';
import {findNextReview, formatReviewCountdown} from './reviewCountdown';

const word = (id: string, state: 0 | 1 | 2 | 3, nextReviewDate: string): Word => ({
  id, word: id, wordStructure: [], wordFamily: [], isGlobal: false, approvalStatus: 'approved',
  createdBy: 'user-1', createdAt: '2026-01-01', deckId: 'deck-1', tags: [], status: 'active',
  meanings: [{id: `${id}-card`, wordId: id, meaning: id, partOfSpeech: 'noun', exampleSentences: [],
    memoryStrength: 'strong', memoryScore: 80, fsrsState: state, nextReviewDate,
    reviewIntervalDays: 1, firstAttemptErrorRate: 0, forgottenWordParts: [], history: []}],
});

describe('review countdown', () => {
  const now = new Date('2026-07-31T05:00:00.000Z');

  it('selects the earliest valid scheduled review and ignores new/invalid cards', () => {
    const result = findNextReview([
      word('new', 0, '2026-07-31T05:10:00.000Z'),
      word('invalid', 2, 'not-a-date'),
      word('later', 2, '2026-07-31T08:00:00.000Z'),
      word('earliest', 1, '2026-07-31T06:45:00.000Z'),
    ], now);
    expect(result.kind).toBe('scheduled');
    if (result.kind === 'scheduled') {
      expect(result.target.toISOString()).toBe('2026-07-31T06:45:00.000Z');
      expect(result.remainingMs).toBe(105 * 60_000);
    }
  });

  it('returns due when any scheduled review is overdue', () => {
    expect(findNextReview([word('overdue', 2, '2026-07-31T04:59:00.000Z')], now)).toEqual({kind: 'due'});
  });

  it('returns none when no scheduled review exists', () => {
    expect(findNextReview([word('new', 0, '2026-07-31T06:00:00.000Z')], now)).toEqual({kind: 'none'});
  });

  it('formats countdowns without exposing seconds or negative values', () => {
    expect(formatReviewCountdown({kind: 'scheduled', target: new Date(), remainingMs: 45 * 60_000})).toBe('45m');
    expect(formatReviewCountdown({kind: 'scheduled', target: new Date(), remainingMs: (2 * 60 + 10) * 60_000})).toBe('2h 10m');
    expect(formatReviewCountdown({kind: 'scheduled', target: new Date(), remainingMs: (24 + 3) * 60 * 60_000})).toBe('1d 3h');
    expect(formatReviewCountdown({kind: 'due'})).toBe('Đã đến lúc ôn');
    expect(formatReviewCountdown({kind: 'none'})).toBe('Chưa có lịch ôn');
  });

  it('interprets legacy date-only values at the local 04:00 study boundary', () => {
    const result = findNextReview(
      [word('legacy', 2, '2026-07-31')],
      new Date('2026-07-30T20:59:00.000Z'),
      'Asia/Ho_Chi_Minh',
    );
    expect(result.kind).toBe('scheduled');
    if (result.kind === 'scheduled') {
      expect(result.target.toISOString()).toBe('2026-07-30T21:00:00.000Z');
    }
  });
});
