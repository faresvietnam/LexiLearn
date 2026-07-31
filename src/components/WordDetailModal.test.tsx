import React from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Word} from '../types';
import {WordDetailModal} from './WordDetailModal';

const word: Word = {
  id: 'word-remember',
  word: 'remember',
  wordStructure: [],
  wordFamily: [],
  isGlobal: false,
  approvalStatus: 'approved',
  createdBy: 'learner-1',
  createdAt: '2026-07-29T00:00:00.000Z',
  deckId: 'deck-general',
  tags: [],
  status: 'active',
  meanings: [{
    id: 'card-remember',
    wordId: 'word-remember',
    meaning: 'nhớ',
    partOfSpeech: 'verb',
    exampleSentences: [],
    memoryStrength: 'strong',
    memoryScore: 91,
    reviewIntervalDays: 3,
    nextReviewDate: '2026-08-02T05:00:00.000Z',
    fsrsState: 2,
    fsrsRetrievability: 0.91,
    lastReviewedDate: '2026-07-29T05:00:00.000Z',
    firstAttemptErrorRate: 0,
    forgottenWordParts: [],
    history: [],
  }],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WordDetailModal FSRS schedule', () => {
  it('shows predicted recall and a relative due time for each learning card', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T05:00:00.000Z'));

    render(
      <WordDetailModal
        word={word}
        attempts={[{
          learning_card_id: 'card-remember',
          is_correct: false,
          first_attempt: true,
          response_time_ms: 1200,
          hint_level: 1,
          answer_revealed: false,
          created_at: '2026-07-29T05:00:00.000Z',
        }, {
          learning_card_id: 'card-remember',
          is_correct: true,
          first_attempt: false,
          response_time_ms: 900,
          hint_level: 0,
          answer_revealed: false,
          created_at: '2026-07-29T05:01:00.000Z',
        }]}
        decks={[]}
        tags={[]}
        onSaveWord={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText('Khả năng nhớ dự đoán: 91%')).toBeInTheDocument();
    expect(screen.getByText('Ôn tiếp theo: in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Ôn gần nhất: 1 day ago')).toBeInTheDocument();
    expect(screen.getByText('Số lần trả lời: 2')).toBeInTheDocument();
    expect(screen.getByText('Đúng lần đầu: 0%')).toBeInTheDocument();
  });
});
