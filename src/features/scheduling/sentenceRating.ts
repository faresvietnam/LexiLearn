import type {AutomaticRating} from './automaticRating';

export interface SentenceRatingInput {
  wrongAttemptsBeforeSuccess: number;
  responseTimeMs: number;
  expectedResponseTimeMs: number;
}

export function deriveSentenceRating(input: SentenceRatingInput): AutomaticRating {
  if (input.wrongAttemptsBeforeSuccess > 0) return 'Hard';

  const speedRatio = input.responseTimeMs / input.expectedResponseTimeMs;
  if (speedRatio > 1.5) return 'Hard';
  if (speedRatio <= 0.6) return 'Easy';
  return 'Good';
}

export function expectedWordOrderResponseTimeMs(wordCount: number): number {
  return Math.max(4_000, wordCount * 1_200);
}

export function expectedTypingResponseTimeMs(wordCount: number): number {
  return Math.max(12_000, wordCount * 1_800);
}
