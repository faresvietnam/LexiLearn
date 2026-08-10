import type {AutomaticRating} from './automaticRating';
import type {MemoryStrength} from '../../types';

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

export function deriveSentenceMemoryStrength(card: {
  fsrsState: number;
  fsrsRetrievability: number;
}): MemoryStrength {
  if (card.fsrsState === 3) return 'critical';
  if (card.fsrsState === 0 || card.fsrsState === 1) return 'weak';

  const score = Math.round(Math.max(0, Math.min(1, card.fsrsRetrievability)) * 100);
  if (score >= 80) return 'strong';
  if (score >= 50) return 'stable';
  if (score >= 25) return 'weak';
  return 'critical';
}
