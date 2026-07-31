import {describe, expect, it} from 'vitest';
import {getLearningStatus} from './fsrsStatus';

describe('getLearningStatus', () => {
  it.each([
    [0, 'new'],
    [1, 'learning'],
    [2, 'review'],
    [3, 'relearning'],
  ])('maps FSRS state %s to %s', (state, expected) => {
    expect(getLearningStatus(state)).toBe(expected);
  });

  it('returns null when a legacy card has no FSRS state', () => {
    expect(getLearningStatus(undefined)).toBeNull();
    expect(getLearningStatus(null)).toBeNull();
  });
});
