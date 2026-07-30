import { MeaningCard, MemoryStrength, LearningHistoryItem } from '../types';

export interface SrsEvaluationResult {
  updatedCard: MeaningCard;
  isCorrectOnFirstAttempt: boolean;
  scoreChange: number;
}

export function recordAttemptAnalytics(
  card: MeaningCard,
  stage: number,
  isFirstAttemptCorrect: boolean,
  attemptsCount: number,
  hintLevelUsed: number,
  responseTimeMs: number,
  errorTypes: string[],
): MeaningCard {
  const historyItem: LearningHistoryItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    date: new Date().toISOString(),
    stage,
    isFirstAttemptCorrect,
    attemptsCount,
    hintLevelUsed,
    responseTimeMs,
    errorTypes,
  };
  const updatedHistory = [...(card.history || []), historyItem];
  const firstAttemptErrorsCount = updatedHistory.filter(
    (history) => !history.isFirstAttemptCorrect,
  ).length;

  return {
    ...card,
    firstAttemptErrorRate: Math.round(
      (firstAttemptErrorsCount / updatedHistory.length) * 100,
    ),
    history: updatedHistory,
  };
}

/**
 * Calculates new memory state based on retry attempt history, hint level, response time
 */
export function evaluateSrsAttempt(
  card: MeaningCard,
  stage: number,
  isFirstAttemptCorrect: boolean,
  attemptsCount: number,
  hintLevelUsed: number,
  responseTimeMs: number,
  errorTypes: string[]
): SrsEvaluationResult {
  const analyticsCard = recordAttemptAnalytics(
    card,
    stage,
    isFirstAttemptCorrect,
    attemptsCount,
    hintLevelUsed,
    responseTimeMs,
    errorTypes,
  );

  let newScore = card.memoryScore || 50;
  let newInterval = card.reviewIntervalDays || 1;

  if (isFirstAttemptCorrect) {
    // Fast answer bonus
    const speedBonus = responseTimeMs < 3000 ? 5 : responseTimeMs < 7000 ? 2 : 0;
    const stageBonus = stage * 3;
    const scoreGain = 12 + speedBonus + stageBonus;

    newScore = Math.min(100, newScore + scoreGain);
    newInterval = Math.max(1, Math.round(newInterval * 1.8));
  } else {
    // Penalize based on attempts count and hint level
    const hintPenalty = hintLevelUsed * 5;
    const retryPenalty = (attemptsCount - 1) * 8;
    const scoreLoss = 15 + hintPenalty + retryPenalty;

    newScore = Math.max(5, newScore - scoreLoss);
    newInterval = 1; // Reset to 1 day on error
  }

  // Derive memory strength level
  let memoryStrength: MemoryStrength = 'critical';
  if (newScore >= 80) {
    memoryStrength = 'strong';
  } else if (newScore >= 50) {
    memoryStrength = 'stable';
  } else if (newScore >= 25) {
    memoryStrength = 'weak';
  }

  // Calculate next review date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  const nextReviewDateStr = nextDate.toISOString().split('T')[0];

  const updatedCard: MeaningCard = {
    ...analyticsCard,
    memoryScore: newScore,
    memoryStrength,
    reviewIntervalDays: newInterval,
    nextReviewDate: nextReviewDateStr,
    lastReviewedDate: new Date().toISOString().split('T')[0],
  };

  return {
    updatedCard,
    isCorrectOnFirstAttempt: isFirstAttemptCorrect,
    scoreChange: newScore - (card.memoryScore || 50),
  };
}

export function isOverdue(nextReviewDateStr: string): boolean {
  if (!nextReviewDateStr) return false;
  const today = new Date().toISOString().split('T')[0];
  return nextReviewDateStr <= today;
}
