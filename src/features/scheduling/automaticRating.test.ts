import { describe, expect, it } from 'vitest';
import { deriveAutomaticRating } from './automaticRating';

const baseInput = {
  questionType: 'full_word_typing' as const,
  isFirstAttemptCorrect: true,
  attemptsCount: 1,
  hintLevelUsed: 0,
  answerRevealed: false,
  responseTimeMs: 7_200,
  expectedAnswerLength: 8,
};

describe('deriveAutomaticRating', () => {
  it.each([
    [{ answerRevealed: true }, 'Again'],
    [{ hintLevelUsed: 5 }, 'Again'],
    [{ isFirstAttemptCorrect: false }, 'Again'],
    [{ attemptsCount: 2 }, 'Again'],
  ])('returns Again for failed or revealed recall: %o', (overrides, rating) => {
    expect(deriveAutomaticRating({ ...baseInput, ...overrides })).toBe(rating);
  });

  it.each([
    [{ hintLevelUsed: 3, responseTimeMs: 1_000 }, 'Hard'],
    [{ hintLevelUsed: 4, responseTimeMs: 1_000 }, 'Hard'],
    [{ hintLevelUsed: 1, responseTimeMs: 18_001 }, 'Hard'],
    [{ hintLevelUsed: 2, responseTimeMs: 5_400 }, 'Good'],
  ])('maps hinted first-attempt recall: %o', (overrides, rating) => {
    expect(deriveAutomaticRating({ ...baseInput, ...overrides })).toBe(rating);
  });

  it.each([
    ['en_to_vn_mc', 4_200],
    ['vn_to_en_mc', 10_500],
    ['word_part_selection', 7_200],
  ] as const)('keeps recognition questions at Good at every non-slow speed', (questionType, responseTimeMs) => {
    expect(deriveAutomaticRating({
      ...baseInput,
      questionType,
      responseTimeMs,
    })).toBe('Good');
  });

  it('maps a slow no-hint answer to Hard before applying question classification', () => {
    expect(deriveAutomaticRating({ ...baseInput, responseTimeMs: 18_001 })).toBe('Hard');
  });

  it.each([
    ['sentence_completion', 15, 7_200, 'Easy'],
    ['word_part_typing', 8, 7_200, 'Easy'],
    ['full_word_typing', 8, 7_200, 'Easy'],
    ['full_word_typing', 8, 7_201, 'Good'],
    ['full_word_typing', 8, 18_000, 'Good'],
    ['full_word_typing', 8, 18_001, 'Hard'],
  ] as const)('uses the specified typed-recall baselines and speed boundaries', (
    questionType,
    expectedAnswerLength,
    responseTimeMs,
    rating,
  ) => {
    expect(deriveAutomaticRating({
      ...baseInput,
      questionType,
      expectedAnswerLength,
      responseTimeMs,
    })).toBe(rating);
  });
});
