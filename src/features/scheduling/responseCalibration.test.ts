import {describe, expect, it} from 'vitest';
import {calibrateResponseBaselines, calibratedResponseTime} from './responseCalibration';

describe('response calibration', () => {
  it('uses the median of successful response times and ignores failed attempts', () => {
    const result = calibrateResponseBaselines([
      {questionType: 'full_word_typing', responseTimeMs: 3000, isCorrect: true},
      {questionType: 'full_word_typing', responseTimeMs: 1000, isCorrect: true},
      {questionType: 'full_word_typing', responseTimeMs: 2000, isCorrect: true},
      {questionType: 'full_word_typing', responseTimeMs: 50, isCorrect: false},
    ]);
    expect(result.full_word_typing).toBe(2000);
  });

  it('falls back when a question type has no history', () => {
    expect(calibratedResponseTime('sentence_completion', 8, {})).toBe(7200);
  });
});
