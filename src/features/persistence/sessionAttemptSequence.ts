import type {StudyAttemptInput} from '../../types';

export function renumberSessionAttempt(
  previousAttemptNumber: number,
  attempt: StudyAttemptInput,
): StudyAttemptInput {
  return {
    ...attempt,
    attemptNumber: previousAttemptNumber + 1,
  };
}
