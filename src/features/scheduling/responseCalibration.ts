import type {QuestionType, StudyAttemptInput} from '../../types';

export type ResponseBaseline = Partial<Record<QuestionType, number>>;

export function calibrateResponseBaselines(
  attempts: Pick<StudyAttemptInput, 'questionType' | 'responseTimeMs' | 'isCorrect'>[],
): ResponseBaseline {
  const grouped = new Map<QuestionType, number[]>();
  for (const attempt of attempts) {
    if (!attempt.isCorrect || attempt.responseTimeMs <= 0) continue;
    const values = grouped.get(attempt.questionType) ?? [];
    values.push(attempt.responseTimeMs);
    grouped.set(attempt.questionType, values);
  }
  return Object.fromEntries([...grouped].map(([type, values]) => [
    type,
    Math.round(values.sort((a, b) => a - b)[Math.floor(values.length / 2)]),
  ])) as ResponseBaseline;
}

export function calibratedResponseTime(
  type: QuestionType,
  expectedAnswerLength: number,
  baselines: ResponseBaseline,
): number {
  return baselines[type] ?? Math.max(7_000, expectedAnswerLength * 900);
}
