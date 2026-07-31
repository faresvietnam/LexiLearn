import {describe, expect, it} from 'vitest';
import type {StudyScope, Word} from '../../types';
import {buildReviewForecast} from './reviewForecast';

const scope: StudyScope = {activeDeckIds: [], excludedTagIds: [], pausedWordIds: []};
const word = (id: string, fsrsState: 0 | 1 | 2 | 3, nextReviewDate: string): Word => ({
  id, word: id, wordStructure: [], wordFamily: [], isGlobal: false, approvalStatus: 'approved',
  createdBy: 'user-1', createdAt: '2026-07-01', deckId: 'deck-1', tags: [], status: 'active',
  meanings: [{id: `${id}-card`, wordId: id, meaning: id, partOfSpeech: 'noun', exampleSentences: [],
    memoryStrength: 'strong', memoryScore: 80, fsrsState, nextReviewDate, reviewIntervalDays: 1,
    firstAttemptErrorRate: 0, forgottenWordParts: [], history: []}],
});

describe('buildReviewForecast', () => {
  it('uses the 04:00 local study day, excludes new/paused cards, and groups future due dates', () => {
    const words = [
      word('overdue', 2, '2026-07-30'),
      word('tomorrow', 2, '2026-08-01T05:00:00.000Z'),
      word('new', 0, '2026-07-31'),
      word('paused', 2, '2026-08-01'),
    ];
    const forecast = buildReviewForecast(words, {...scope, pausedWordIds: ['paused']}, new Date('2026-07-31T05:00:00.000Z'));

    expect(forecast[0]).toMatchObject({dateKey: '2026-07-31', count: 1, isToday: true});
    expect(forecast[1]).toMatchObject({dateKey: '2026-08-01', count: 1});
  });

  it('keeps a review at 03:30 Vietnam time in the previous study day', () => {
    const forecast = buildReviewForecast([word('review', 2, '2026-07-30T20:00:00.000Z')], scope, new Date('2026-07-30T20:30:00.000Z'));
    expect(forecast[0]).toMatchObject({dateKey: '2026-07-30', count: 1});
  });
});
