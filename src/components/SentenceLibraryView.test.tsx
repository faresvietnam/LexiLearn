import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SentenceLibraryView} from './SentenceLibraryView';
import type {SentenceCard} from '../types';

afterEach(cleanup);

const CARD: SentenceCard = {
  id: 'sentence-1',
  imageUrl: 'https://images.example/cat.png',
  imageObjectKey: 'users/user-1/images/cat.png',
  englishSentence: 'The cat sleeps.',
  vietnameseSentence: 'Con mèo đang ngủ.',
  createdAt: '2026-08-01T00:00:00.000Z',
  nextReviewDate: '2026-08-01T00:00:00.000Z',
  reviewIntervalDays: 0,
  fsrsState: 0,
  fsrsStability: 0,
  fsrsDifficulty: 0,
  fsrsElapsedDays: 0,
  fsrsScheduledDays: 0,
  fsrsLearningSteps: 0,
  fsrsReps: 0,
  fsrsLapses: 0,
  fsrsRetrievability: 1,
};

describe('SentenceLibraryView', () => {
  it('shows an empty state with no cards', () => {
    render(
      <SentenceLibraryView
        sentenceCards={[]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Chưa có câu nào/)).toBeInTheDocument();
  });

  it('lists a card and calls onDeleteSentenceCard on delete click', () => {
    const onDeleteSentenceCard = vi.fn().mockResolvedValue(true);
    render(
      <SentenceLibraryView
        sentenceCards={[CARD]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={onDeleteSentenceCard}
      />,
    );

    expect(screen.getByText('The cat sleeps.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Xoá câu: The cat sleeps.'}));
    expect(onDeleteSentenceCard).toHaveBeenCalledWith(CARD);
  });

  it('opens the edit form pre-filled and saves through onEditSentenceCard', async () => {
    const onEditSentenceCard = vi.fn().mockResolvedValue(true);
    render(
      <SentenceLibraryView
        sentenceCards={[CARD]}
        onEditSentenceCard={onEditSentenceCard}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Sửa câu: The cat sleeps.'}));
    expect(screen.getByLabelText('Câu tiếng Anh')).toHaveValue('The cat sleeps.');

    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));
    await waitFor(() => expect(onEditSentenceCard).toHaveBeenCalledWith(
      'sentence-1',
      expect.objectContaining({englishSentence: 'The cat sleeps.'}),
    ));
  });
});
