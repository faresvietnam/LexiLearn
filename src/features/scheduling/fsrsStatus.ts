import type {FsrsState} from '../../types';

export type LearningStatus =
  | 'new'
  | 'learning'
  | 'review'
  | 'relearning';

const STATUS_BY_STATE: Record<FsrsState, LearningStatus> = {
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'relearning',
};

export function getLearningStatus(
  state: number | null | undefined,
): LearningStatus | null {
  if (state === null || state === undefined || !Number.isInteger(state)) {
    return null;
  }
  return state in STATUS_BY_STATE
    ? STATUS_BY_STATE[state as FsrsState]
    : null;
}
