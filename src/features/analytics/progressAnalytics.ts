import type {StudyScope, Word} from '../../types';
import {getStudyDate} from '../../lib/studyDate';

export type ProgressAttemptRow = {
  learning_card_id: string;
  sentence_key?: string | null;
  question_type?: string | null;
  is_correct: boolean;
  first_attempt: boolean;
  response_time_ms: number | null;
  hint_level: number;
  answer_revealed: boolean;
  created_at: string;
};

export type ProgressAnalytics = {
  totalCards: number;
  stateCounts: {new: number; learning: number; review: number; relearning: number};
  predictedRetention: number | null;
  firstAttemptAccuracy: number | null;
  overallAccuracy: number | null;
  retryRate: number | null;
  hintRate: number | null;
  revealRate: number | null;
  averageResponseTimeMs: number | null;
  activity: Array<{studyDate: string; attempts: number; firstAttemptCorrect: number; minutes: number}>;
  cards: Array<{cardId: string; fsrsState: number; predictedRetention: number | null; attempts: number; firstAttemptAccuracy: number | null; lastReviewedDate?: string; nextReviewDate: string}>;
};

const percent = (value: number, total: number): number | null =>
  total > 0 ? Math.round((value / total) * 100) : null;

const addDays = (studyDate: string, offset: number): string => {
  const date = new Date(`${studyDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export function calculateProgressAnalytics(
  words: Word[],
  attempts: ProgressAttemptRow[],
  now: Date,
  timezone = 'Asia/Ho_Chi_Minh',
  studyScope?: StudyScope,
): ProgressAnalytics {
  const activeWords = words.filter((word) => {
    if (word.status !== 'active') return false;
    if (studyScope?.activeDeckIds.length && !studyScope.activeDeckIds.includes(word.deckId)) return false;
    if (studyScope?.excludedTagIds.some((tag) => word.tags.includes(tag))) return false;
    if (studyScope?.pausedWordIds.includes(word.id)) return false;
    return true;
  });
  const cards = activeWords.flatMap((word) => word.meanings);
  const cardIds = new Set(cards.map((card) => card.id));
  const scopedAttempts = attempts.filter((attempt) => cardIds.has(attempt.learning_card_id));
  const stateCounts = {new: 0, learning: 0, review: 0, relearning: 0};
  const stateNames = ['new', 'learning', 'review', 'relearning'] as const;
  cards.forEach((card) => {
    const state = card.fsrsState ?? 0;
    if (state >= 0 && state <= 3) stateCounts[stateNames[state]] += 1;
  });

  const scheduledCards = cards.filter((card) => card.fsrsState !== 0 && typeof card.fsrsRetrievability === 'number');
  const predictedRetention = scheduledCards.length > 0
    ? Math.round(scheduledCards.reduce((sum, card) => sum + (card.fsrsRetrievability ?? 0), 0) / scheduledCards.length * 100)
    : null;
  const firstAttempts = scopedAttempts.filter((attempt) => attempt.first_attempt);
  const responseTimes = scopedAttempts
    .map((attempt) => attempt.response_time_ms)
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  const activityBase = getStudyDate(now, timezone);
  const activity = Array.from({length: 7}, (_, index) => {
    const studyDate = addDays(activityBase, index - 6);
    const rows = scopedAttempts.filter((attempt) => getStudyDate(new Date(attempt.created_at), timezone) === studyDate);
    return {
      studyDate,
      attempts: rows.length,
      firstAttemptCorrect: rows.filter((attempt) => attempt.first_attempt && attempt.is_correct).length,
      minutes: Math.round(rows.reduce((sum, attempt) => sum + (attempt.response_time_ms ?? 0), 0) / 60000 * 10) / 10,
    };
  });
  const cardsAnalytics = cards.map((card) => {
    const rows = scopedAttempts.filter((attempt) => attempt.learning_card_id === card.id);
    const first = rows.filter((attempt) => attempt.first_attempt);
    return {
      cardId: card.id,
      fsrsState: card.fsrsState ?? 0,
      predictedRetention: card.fsrsState !== 0 && typeof card.fsrsRetrievability === 'number'
        ? Math.round(card.fsrsRetrievability * 100)
        : null,
      attempts: rows.length,
      firstAttemptAccuracy: percent(first.filter((attempt) => attempt.is_correct).length, first.length),
      lastReviewedDate: card.lastReviewedDate,
      nextReviewDate: card.nextReviewDate,
    };
  });

  return {
    totalCards: cards.length,
    stateCounts,
    predictedRetention,
    firstAttemptAccuracy: percent(firstAttempts.filter((attempt) => attempt.is_correct).length, firstAttempts.length),
    overallAccuracy: percent(scopedAttempts.filter((attempt) => attempt.is_correct).length, scopedAttempts.length),
    retryRate: percent(scopedAttempts.filter((attempt) => !attempt.first_attempt).length, scopedAttempts.length),
    hintRate: percent(scopedAttempts.filter((attempt) => attempt.hint_level > 0).length, scopedAttempts.length),
    revealRate: percent(scopedAttempts.filter((attempt) => attempt.answer_revealed).length, scopedAttempts.length),
    averageResponseTimeMs: responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
      : null,
    activity,
    cards: cardsAnalytics,
  };
}
