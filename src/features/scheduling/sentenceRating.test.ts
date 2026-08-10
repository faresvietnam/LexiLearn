import {describe, expect, it} from 'vitest';
import {
  deriveSentenceMemoryStrength,
  deriveSentenceRating,
  expectedTypingResponseTimeMs,
  expectedWordOrderResponseTimeMs,
} from './sentenceRating';

describe('deriveSentenceRating', () => {
  it('rates Hard whenever a retry was needed, regardless of speed', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 1,
      responseTimeMs: 100,
      expectedResponseTimeMs: 10_000,
    })).toBe('Hard');
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 2,
      responseTimeMs: 100,
      expectedResponseTimeMs: 10_000,
    })).toBe('Hard');
  });

  it('rates Easy when correct on the first try and fast', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 0,
      responseTimeMs: 1_000,
      expectedResponseTimeMs: 10_000,
    })).toBe('Easy');
  });

  it('rates Good when correct on the first try at a normal pace', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 0,
      responseTimeMs: 10_000,
      expectedResponseTimeMs: 10_000,
    })).toBe('Good');
  });

  it('rates Hard when correct on the first try but slow', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 0,
      responseTimeMs: 20_000,
      expectedResponseTimeMs: 10_000,
    })).toBe('Hard');
  });
});

describe('expectedWordOrderResponseTimeMs', () => {
  it('scales with word count above a floor', () => {
    expect(expectedWordOrderResponseTimeMs(1)).toBe(4_000);
    expect(expectedWordOrderResponseTimeMs(10)).toBe(12_000);
  });
});

describe('expectedTypingResponseTimeMs', () => {
  it('scales with word count above a floor', () => {
    expect(expectedTypingResponseTimeMs(1)).toBe(12_000);
    expect(expectedTypingResponseTimeMs(10)).toBe(18_000);
  });
});

describe('deriveSentenceMemoryStrength', () => {
  it('rates a Relearning card critical regardless of retrievability', () => {
    expect(deriveSentenceMemoryStrength({fsrsState: 3, fsrsRetrievability: 0.95})).toBe('critical');
  });

  it('rates New and Learning cards weak', () => {
    expect(deriveSentenceMemoryStrength({fsrsState: 0, fsrsRetrievability: 1})).toBe('weak');
    expect(deriveSentenceMemoryStrength({fsrsState: 1, fsrsRetrievability: 1})).toBe('weak');
  });

  it('buckets a Review card by retrievability', () => {
    expect(deriveSentenceMemoryStrength({fsrsState: 2, fsrsRetrievability: 0.85})).toBe('strong');
    expect(deriveSentenceMemoryStrength({fsrsState: 2, fsrsRetrievability: 0.6})).toBe('stable');
    expect(deriveSentenceMemoryStrength({fsrsState: 2, fsrsRetrievability: 0.3})).toBe('weak');
    expect(deriveSentenceMemoryStrength({fsrsState: 2, fsrsRetrievability: 0.1})).toBe('critical');
  });
});
