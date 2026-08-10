import {describe, expect, it} from 'vitest';
import {deriveSentenceRating} from './sentenceRating';

describe('deriveSentenceRating', () => {
  it('rates Good when the first attempt is correct', () => {
    expect(deriveSentenceRating(0)).toBe('Good');
  });

  it('rates Hard when a retry was needed before the correct attempt', () => {
    expect(deriveSentenceRating(1)).toBe('Hard');
    expect(deriveSentenceRating(2)).toBe('Hard');
  });
});
