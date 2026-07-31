import type {MeaningCard} from '../../types';

export function calculateForgettingRisk(card: MeaningCard, now = new Date()): number {
  const recall = card.fsrsRetrievability ?? Math.max(0, Math.min(1, (card.memoryScore ?? 0) / 100));
  const overdueDays = card.nextReviewDate
    ? Math.max(0, (now.getTime() - new Date(card.nextReviewDate).getTime()) / 86_400_000)
    : 0;
  const skillScores = [card.recognitionScore, card.recallScore, card.spellingScore, card.contextScore, card.wordStructureScore]
    .filter((score): score is number => score !== undefined);
  const skillWeakness = skillScores.length === 0
    ? 0
    : 1 - skillScores.reduce((sum, score) => sum + score, 0) / skillScores.length / 100;
  return Math.round((1 - recall) * 60 + Math.min(overdueDays, 7) * 4 + Math.min(card.fsrsLapses ?? 0, 5) * 4 + skillWeakness * 20);
}
