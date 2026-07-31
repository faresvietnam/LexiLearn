import type {QuestionType} from '../../types';

export type SkillName =
  | 'recognition_score'
  | 'recall_score'
  | 'spelling_score'
  | 'context_score'
  | 'word_structure_score';

export type SkillScores = Record<SkillName, number> & {
  response_time_sample_count: number;
  response_time_average_ms: number;
};

export type SkillScoreInput = {
  questionType: QuestionType;
  isCorrect: boolean;
  firstAttempt: boolean;
  responseTimeMs: number;
  hintLevel: number;
  answerRevealed: boolean;
  errorTypes: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function skillForQuestion(type: QuestionType): SkillName {
  if (type === 'en_to_vn_mc' || type === 'vn_to_en_mc' || type === 'image_question' || type === 'audio_question') return 'recognition_score';
  if (type === 'sentence_completion') return 'context_score';
  if (type === 'word_part_selection' || type === 'word_part_typing') return 'word_structure_score';
  return 'spelling_score';
}

export function updateSkillScores(previous: Partial<SkillScores>, input: SkillScoreInput): SkillScores {
  const skill = skillForQuestion(input.questionType);
  const prior = previous[skill] ?? 0;
  const evidence = !input.isCorrect || input.answerRevealed
    ? -12
    : input.firstAttempt && input.hintLevel === 0
      ? 10
      : 4;
  const errorPenalty = input.errorTypes.length * 3;
  const next = clamp(prior + evidence - errorPenalty);
  const count = previous.response_time_sample_count ?? 0;
  const average = previous.response_time_average_ms ?? 0;
  return {
    recognition_score: previous.recognition_score ?? 0,
    recall_score: previous.recall_score ?? 0,
    spelling_score: previous.spelling_score ?? 0,
    context_score: previous.context_score ?? 0,
    word_structure_score: previous.word_structure_score ?? 0,
    response_time_sample_count: count + 1,
    response_time_average_ms: Math.round((average * count + Math.max(0, input.responseTimeMs)) / (count + 1)),
    [skill]: next,
  };
}
