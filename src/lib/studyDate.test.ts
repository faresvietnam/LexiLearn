import {describe, expect, it} from 'vitest';

import {getStudyDate} from './studyDate';

describe('getStudyDate', () => {
  it('assigns 03:59 local time to the previous study date', () => {
    const instant = new Date('2026-07-28T20:59:00.000Z');

    expect(getStudyDate(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-07-28');
  });

  it('starts the current study date at 04:00 local time', () => {
    const instant = new Date('2026-07-28T21:00:00.000Z');

    expect(getStudyDate(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-07-29');
  });
});
