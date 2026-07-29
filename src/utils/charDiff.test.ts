import { describe, expect, it } from 'vitest';
import { computeCharDiff } from './charDiff';

describe('computeCharDiff', () => {
  it('marks omitted characters as missing', () => {
    const result = computeCharDiff('cat', 'cart');

    expect(result.isExactMatch).toBe(false);
    expect(result.errorTypes).toContain('Missing character');
    expect(result.tokens).toContainEqual(
      expect.objectContaining({ status: 'missing', expectedChar: 't', index: 3 })
    );
  });

  it('identifies adjacent swapped characters', () => {
    const result = computeCharDiff('teh', 'the');

    expect(result.errorTypes).toContain('Transposed characters');
    expect(result.firstErrorIndex).toBe(1);
    expect(result.tokens[1]).toMatchObject({ status: 'transposed', index: 1 });
  });
});
