import {describe, expect, it} from 'vitest';
import {formatComeBackAt, formatRelativeDueTime} from './relativeDueTime';

describe('formatRelativeDueTime', () => {
  it('returns "now" for times within a minute', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    expect(formatRelativeDueTime('2026-08-10T12:00:30.000Z', now)).toBe('now');
  });

  it('formats a future time in minutes/hours/days', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    expect(formatRelativeDueTime('2026-08-10T12:10:00.000Z', now)).toBe('in 10 minutes');
    expect(formatRelativeDueTime('2026-08-10T15:00:00.000Z', now)).toBe('in 3 hours');
    expect(formatRelativeDueTime('2026-08-13T12:00:00.000Z', now)).toBe('in 3 days');
  });

  it('formats a past time as "ago"', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    expect(formatRelativeDueTime('2026-08-10T11:00:00.000Z', now)).toBe('1 hour ago');
  });
});

describe('formatComeBackAt', () => {
  it('shows just the time when the target is later today', () => {
    const now = new Date('2026-08-10T05:00:00.000Z'); // 12:00 in Asia/Ho_Chi_Minh
    const target = new Date('2026-08-10T08:00:00.000Z'); // 15:00 in Asia/Ho_Chi_Minh
    expect(formatComeBackAt(target, now)).toBe('Hãy quay lại lúc 15:00');
  });

  it('includes the date when the target is a different day', () => {
    const now = new Date('2026-08-10T05:00:00.000Z');
    const target = new Date('2026-08-12T08:00:00.000Z');
    expect(formatComeBackAt(target, now)).toBe('Hãy quay lại lúc 15:00 ngày 12-08');
  });
});
