import React from 'react';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {INITIAL_STUDY_SCOPE} from '../data/mockData';
import type {Word} from '../types';
import {ProgressView} from './ProgressView';

const words: Word[] = [{
  id: 'word-1', word: 'remember', wordStructure: [], wordFamily: [], isGlobal: false,
  approvalStatus: 'approved', createdBy: 'user-1', createdAt: '2026-08-01', deckId: 'deck_general', tags: [], status: 'active',
  meanings: [{
    id: 'card-1', wordId: 'word-1', meaning: 'nhớ', partOfSpeech: 'verb', exampleSentences: [],
    memoryStrength: 'strong', memoryScore: 80, fsrsState: 2, fsrsRetrievability: 0.8,
    reviewIntervalDays: 2, nextReviewDate: '2026-08-03', firstAttemptErrorRate: 0, forgottenWordParts: [], history: [],
  }],
}];

describe('ProgressView', () => {
  it('renders FSRS retention and observed attempt metrics', () => {
    render(<ProgressView words={words} studyScope={INITIAL_STUDY_SCOPE} attempts={[{
      learning_card_id: 'card-1', is_correct: true, first_attempt: true,
      response_time_ms: 1000, hint_level: 0, answer_revealed: false,
      created_at: '2026-08-01T05:00:00Z',
    }]} />);

    expect(screen.getByText('Khả năng nhớ dự đoán')).toBeInTheDocument();
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đúng lần đầu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tỷ lệ nhớ từ (Retention Rate)')).not.toBeInTheDocument();
  });
});
