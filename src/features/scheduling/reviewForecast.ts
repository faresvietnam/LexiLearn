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
  const activeWords = words.filter((word) => {
    if (word.status !== 'active') return false;
    if (studyScope.activeDeckIds.length > 0 && !studyScope.activeDeckIds.includes(word.deckId)) return false;
    if (studyScope.excludedTagIds.some((tag) => word.tags.includes(tag))) return false;
    if (studyScope.pausedWordIds.includes(word.id)) return false;
    return true;
  });

  return Array.from({length: days}, (_, offset) => {
    const dateKey = addStudyDays(todayStudyDate, offset);
    // Count distinct WORDS due, not meaning-cards — a word with several
    // meanings due the same day is still just one word to open and review.
    const count = activeWords.filter((word) => word.meanings.some((meaning) => {
      if ((meaning.fsrsState ?? 0) === 0) return false;
      const dueDate = reviewStudyDate(meaning.nextReviewDate, timezone);
      if (dueDate === null) return false;

      // A card reviewed during today's study day has already contributed to
      // today's forecast. Even if FSRS schedules a short same-day relearning
      // step, keep the dashboard count focused on work still awaiting its
      // first review today; future forecast days continue to use the next due
      // date normally.
      if (offset === 0 && reviewStudyDate(meaning.lastReviewedDate, timezone) === todayStudyDate) {
        return false;
      }

      return offset === 0 ? dueDate <= todayStudyDate : dueDate === dateKey;
    })).length;
    const date = new Date(`${dateKey}T12:00:00.000Z`);
    return {
      dateKey,
      day: new Intl.DateTimeFormat('vi-VN', {weekday: 'short', timeZone: 'UTC'}).format(date).replace('.', ''),
      count,
      isToday: offset === 0,
    };
  });
}
