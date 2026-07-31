import {describe, expect, it} from 'vitest';
import {updateSkillScores} from './skillScores';

describe('updateSkillScores', () => {
  it('records clean first-attempt recognition and response time', () => {
    const result = updateSkillScores({}, {
      questionType: 'en_to_vn_mc', isCorrect: true, firstAttempt: true,
      responseTimeMs: 1200, hintLevel: 0, answerRevealed: false, errorTypes: [],
    });
    expect(result.recognition_score).toBe(10);
    expect(result.response_time_average_ms).toBe(1200);
  });

  it('penalizes spelling errors without changing unrelated skills', () => {
    const result = updateSkillScores({recognition_score: 50, spelling_score: 50}, {
      questionType: 'full_word_typing', isCorrect: false, firstAttempt: false,
      responseTimeMs: 3000, hintLevel: 1, answerRevealed: false,
      errorTypes: ['replacement', 'missing_character'],
    });
    expect(result.spelling_score).toBe(32);
    expect(result.recognition_score).toBe(50);
  });
});
