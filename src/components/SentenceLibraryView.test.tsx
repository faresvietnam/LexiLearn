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

function buildCard(overrides: Partial<SentenceCard>): SentenceCard {
  return {...CARD, ...overrides};
}

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

  it('shows a memory-strength badge and learning-status label for each card', () => {
    render(
      <SentenceLibraryView
        sentenceCards={[buildCard({fsrsState: 2, fsrsRetrievability: 0.9})]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    expect(screen.getByText('strong')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows the weak badge and Mới label for a brand-new card', () => {
    render(
      <SentenceLibraryView
        sentenceCards={[buildCard({fsrsState: 0})]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    expect(screen.getByText('weak')).toBeInTheDocument();
    expect(screen.getByText('Mới')).toBeInTheDocument();
  });

  it('paginates at 20 cards per page', () => {
    const cards = Array.from({length: 25}, (_, i) => buildCard({
      id: `sentence-${i + 1}`,
      englishSentence: `Sentence number ${i + 1}.`,
    }));
    render(
      <SentenceLibraryView
        sentenceCards={cards}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    expect(screen.getByText('Sentence number 1.')).toBeInTheDocument();
    expect(screen.queryByText('Sentence number 21.')).not.toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Trang sau'}));

    expect(screen.getByText('Sentence number 21.')).toBeInTheDocument();
    expect(screen.queryByText('Sentence number 1.')).not.toBeInTheDocument();
    expect(screen.getByText('Trang 2 / 2')).toBeInTheDocument();
  });

  it('shows the time remaining until the next review', () => {
    render(
      <SentenceLibraryView
        sentenceCards={[buildCard({nextReviewDate: '2026-08-11T00:00:00.000Z'})]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    expect(screen.getByText(/Ôn tiếp theo:/)).toBeInTheDocument();
  });

  it('sorts cards by soonest next review date first', () => {
    const cards = [
      buildCard({id: 'sentence-later', englishSentence: 'Later sentence.', nextReviewDate: '2026-08-20T00:00:00.000Z'}),
      buildCard({id: 'sentence-soonest', englishSentence: 'Soonest sentence.', nextReviewDate: '2026-08-10T00:00:00.000Z'}),
      buildCard({id: 'sentence-middle', englishSentence: 'Middle sentence.', nextReviewDate: '2026-08-15T00:00:00.000Z'}),
    ];
    render(
      <SentenceLibraryView
        sentenceCards={cards}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    const sentenceTexts = screen.getAllByText(/sentence\./i).map((el) => el.textContent);
    expect(sentenceTexts).toEqual(['Soonest sentence.', 'Middle sentence.', 'Later sentence.']);
  });
});
