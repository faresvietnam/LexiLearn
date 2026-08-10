import type {AutomaticRating} from './automaticRating';

export function deriveSentenceRating(wrongAttemptsBeforeSuccess: number): AutomaticRating {
  return wrongAttemptsBeforeSuccess === 0 ? 'Good' : 'Hard';
}
