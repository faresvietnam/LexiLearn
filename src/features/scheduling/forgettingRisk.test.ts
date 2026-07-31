import {describe, expect, it} from 'vitest';
import {calculateForgettingRisk} from './forgettingRisk';

const card = (overrides: Record<string, unknown> = {}) => ({
  memoryScore: 90, fsrsRetrievability: 0.9, nextReviewDate: '2099-01-01', fsrsLapses: 0,
  ...overrides,
} as never);

describe('calculateForgettingRisk', () => {
  it('ranks low retrievability and lapses as higher risk', () => {
    expect(calculateForgettingRisk(card({fsrsRetrievability: 0.4, fsrsLapses: 2}))).toBeGreaterThan(
      calculateForgettingRisk(card()),
    );
  });
});
