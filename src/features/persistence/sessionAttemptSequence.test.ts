import {describe, expect, it} from 'vitest';
import type {StudyAttemptInput} from '../../types';
import {renumberSessionAttempt} from './sessionAttemptSequence';

const attempt = (attemptNumber: number): StudyAttemptInput => ({
  learningCardId: 'card-1',
  questionType: 'full_word_typing',
  inputMode: 'typing',
  attemptNumber,
  submittedAnswer: 'remember',
  isCorrect: true,
  firstAttempt: attemptNumber === 1,
  responseTimeMs: 1_000,
  hintLevel: 0,
  answerRevealed: false,
  errorTypes: [],
});

describe('session attempt sequence', () => {
  it('keeps attempt numbers increasing when a failed card returns later', () => {
    const firstVisit = [
      renumberSessionAttempt(0, attempt(1)),
      renumberSessionAttempt(1, attempt(2)),
    ];
    const secondVisit = renumberSessionAttempt(2, attempt(1));

    expect(firstVisit.map(({attemptNumber}) => attemptNumber)).toEqual([1, 2]);
    expect(secondVisit.attemptNumber).toBe(3);
  });
});
