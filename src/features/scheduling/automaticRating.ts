import type { QuestionType } from '../../types';

export type AutomaticRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface AutomaticRatingInput {
  questionType: QuestionType;
  isFirstAttemptCorrect: boolean;
  attemptsCount: number;
  hintLevelUsed: number;
  answerRevealed: boolean;
  responseTimeMs: number;
  expectedAnswerLength: number;
}

const RECOGNITION_QUESTION_TYPES: readonly QuestionType[] = [
  'en_to_vn_mc',
  'vn_to_en_mc',
  'image_question',
  'audio_question',
  'word_part_selection',
];

function expectedResponseTimeMs(
  questionType: QuestionType,
  expectedAnswerLength: number,
): number {
  switch (questionType) {
    case 'en_to_vn_mc':
    case 'vn_to_en_mc':
    case 'image_question':
    case 'audio_question':
      return 7_000;
    case 'word_part_selection':
      return 12_000;
    case 'sentence_completion':
      return Math.max(12_000, expectedAnswerLength * 800);
    case 'word_part_typing':
      return Math.max(15_000, expectedAnswerLength * 1_000);
    case 'full_word_typing':
      return Math.max(12_000, expectedAnswerLength * 900);
  }
}

export function deriveAutomaticRating(input: AutomaticRatingInput): AutomaticRating {
  if (
    input.answerRevealed
    || input.hintLevelUsed >= 5
    || !input.isFirstAttemptCorrect
    || input.attemptsCount > 1
  ) {
    return 'Again';
  }

  if (input.hintLevelUsed >= 3) return 'Hard';

  const speedRatio = input.responseTimeMs / expectedResponseTimeMs(
    input.questionType,
    input.expectedAnswerLength,
  );
  const isSlow = speedRatio > 1.5;

  if (input.hintLevelUsed >= 1) return isSlow ? 'Hard' : 'Good';
  if (isSlow) return 'Hard';
  if (RECOGNITION_QUESTION_TYPES.includes(input.questionType)) return 'Good';

  return speedRatio <= 0.6 ? 'Easy' : 'Good';
}
