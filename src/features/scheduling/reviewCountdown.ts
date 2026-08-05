import type {Word} from '../../types';

export type ReviewCountdownState =
  | {kind: 'due'}
  | {kind: 'scheduled'; target: Date; remainingMs: number}
  | {kind: 'none'};

const HOUR = 60 * 60_000;
export const SHORT_TERM_WINDOW_MS = 15 * 60_000;

const timeZoneParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
};

/** Converts a local study-day boundary to an instant without depending on browser timezone. */
const localBoundaryToUtc = (dateKey: string, timezone: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const approximate = new Date(`${dateKey}T04:00:00.000Z`);
  if (Number.isNaN(approximate.getTime())) return null;
  const local = timeZoneParts(approximate, timezone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return new Date(approximate.getTime() - (localAsUtc - approximate.getTime()));
};

const parseReviewDate = (value: string | undefined, timezone: string): Date | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return localBoundaryToUtc(value, timezone);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function findNextReview(
  words: Word[],
  now: Date,
  timezone = 'Asia/Ho_Chi_Minh',
): ReviewCountdownState {
  let earliest: Date | null = null;
  for (const word of words) {
    for (const card of word.meanings) {
      if ((card.fsrsState ?? 0) === 0) continue;
      const target = parseReviewDate(card.nextReviewDate, timezone);
      if (!target) continue;
      if (target.getTime() <= now.getTime()) return {kind: 'due'};
      if (!earliest || target.getTime() < earliest.getTime()) earliest = target;
    }
  }
  if (!earliest) return {kind: 'none'};
  return {kind: 'scheduled', target: earliest, remainingMs: Math.max(0, earliest.getTime() - now.getTime())};
}

export function isReviewDue(
  nextReviewDate: string | undefined,
  now = new Date(),
  timezone = 'Asia/Ho_Chi_Minh',
): boolean {
  const target = parseReviewDate(nextReviewDate, timezone);
  return target !== null && target.getTime() <= now.getTime();
}

export function isReviewDueWithin(
  nextReviewDate: string | undefined,
  windowMs: number,
  now = new Date(),
  timezone = 'Asia/Ho_Chi_Minh',
): boolean {
  const target = parseReviewDate(nextReviewDate, timezone);
  if (!target) return false;
  const msUntilDue = target.getTime() - now.getTime();
  return msUntilDue > 0 && msUntilDue <= windowMs;
}

export function formatReviewCountdown(state: ReviewCountdownState): string {
  if (state.kind === 'due') return '0 giờ';
  if (state.kind === 'none') return '—';
  const hours = Math.max(1, Math.ceil(state.remainingMs / HOUR));
  return `${hours} giờ`;
}
