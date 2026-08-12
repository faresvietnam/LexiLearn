import {describe, expect, it} from 'vitest';
import {
  deriveSentenceMemoryStrength,
  deriveSentenceRating,
} from './sentenceRating';

describe('deriveSentenceRating', () => {
  it('rates Hard whenever a retry was needed', () => {
    expect(deriveSentenceRating({wrongAttemptsBeforeSuccess: 1})).toBe('Hard');
    expect(deriveSentenceRating({wrongAttemptsBeforeSuccess: 2})).toBe('Hard');
  });

  it('rates Good when correct on the first try', () => {
    expect(deriveSentenceRating({wrongAttemptsBeforeSuccess: 0})).toBe('Good');
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
