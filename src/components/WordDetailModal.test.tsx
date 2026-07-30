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
        decks={[]}
        tags={[]}
        onSaveWord={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText('Predicted recall: 91%')).toBeInTheDocument();
    expect(screen.getByText('Review again: in 3 days')).toBeInTheDocument();
  });
});
