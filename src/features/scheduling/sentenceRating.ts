import type {AutomaticRating} from './automaticRating';
import type {MemoryStrength} from '../../types';

export interface SentenceRatingInput {
  wrongAttemptsBeforeSuccess: number;
}

export function deriveSentenceRating(input: SentenceRatingInput): AutomaticRating {
  return input.wrongAttemptsBeforeSuccess > 0 ? 'Hard' : 'Good';
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
