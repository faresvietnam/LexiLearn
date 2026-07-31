import {describe, expect, it} from 'vitest';
import {aggregateSentenceAnalytics} from './sentenceAnalytics';

describe('aggregateSentenceAnalytics', () => {
  it('ignores attempts without a sentence key', () => {
    expect(aggregateSentenceAnalytics([{
      sentence_key: null,
      is_correct: false,
      first_attempt: true,
      response_time_ms: 1000,
      created_at: '2026-07-30T01:00:00Z',
    }])).toEqual([]);
  });

  it('aggregates accuracy, first-attempt accuracy, and response time', () => {
    expect(aggregateSentenceAnalytics([
      {sentence_key: 's1', is_correct: true, first_attempt: true, response_time_ms: 1000, created_at: '2026-07-30T01:00:00Z'},
      {sentence_key: 's1', is_correct: false, first_attempt: false, response_time_ms: 3000, created_at: '2026-07-30T02:00:00Z'},
    ])).toEqual([{
      sentenceKey: 's1',
      attempts: 2,
      correctAttempts: 1,
      accuracy: 50,
      firstAttemptCorrect: 100,
      averageResponseTimeMs: 2000,
      lastSeenAt: '2026-07-30T02:00:00Z',
    }]);
  });

  it('orders the most difficult sentences first deterministically', () => {
    const result = aggregateSentenceAnalytics([
      {sentence_key: 'easy', is_correct: true, first_attempt: true, response_time_ms: null, created_at: '2026-07-30T01:00:00Z'},
      {sentence_key: 'hard-b', is_correct: false, first_attempt: true, response_time_ms: null, created_at: '2026-07-30T01:00:00Z'},
      {sentence_key: 'hard-a', is_correct: false, first_attempt: true, response_time_ms: null, created_at: '2026-07-30T01:00:00Z'},
    ]);
    expect(result.map(({sentenceKey}) => sentenceKey)).toEqual(['hard-a', 'hard-b', 'easy']);
  });
});
