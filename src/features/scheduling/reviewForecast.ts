import type {StudyScope, Word} from '../../types';
import {getStudyDate} from '../../lib/studyDate';

export type ReviewForecastDay = {
  dateKey: string;
  day: string;
  count: number;
  isToday: boolean;
};

const addStudyDays = (studyDate: string, offset: number): string => {
  const date = new Date(`${studyDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const reviewStudyDate = (value: string | undefined, timezone: string): string | null => {
  if (!value) return null;
  return value.includes('T') ? getStudyDate(new Date(value), timezone) : value.slice(0, 10);
};

export function buildReviewForecast(
  words: Word[],
  studyScope: StudyScope,
  now = new Date(),
  timezone = 'Asia/Ho_Chi_Minh',
  days = 7,
): ReviewForecastDay[] {
  const todayStudyDate = getStudyDate(now, timezone);
  const activeCards = words
    .filter((word) => {
      if (word.status !== 'active') return false;
      if (studyScope.activeDeckIds.length > 0 && !studyScope.activeDeckIds.includes(word.deckId)) return false;
      if (studyScope.excludedTagIds.some((tag) => word.tags.includes(tag))) return false;
      if (studyScope.pausedWordIds.includes(word.id)) return false;
      return true;
    })
    .flatMap((word) => word.meanings)
    .filter((meaning) => (meaning.fsrsState ?? 0) !== 0);

  return Array.from({length: days}, (_, offset) => {
    const dateKey = addStudyDays(todayStudyDate, offset);
    const count = activeCards.filter((meaning) => {
      const dueDate = reviewStudyDate(meaning.nextReviewDate, timezone);
      return dueDate !== null && (offset === 0 ? dueDate <= todayStudyDate : dueDate === dateKey);
    }).length;
    const date = new Date(`${dateKey}T12:00:00.000Z`);
    return {
      dateKey,
      day: new Intl.DateTimeFormat('vi-VN', {weekday: 'short', timeZone: 'UTC'}).format(date).replace('.', ''),
      count,
      isToday: offset === 0,
    };
  });
}
