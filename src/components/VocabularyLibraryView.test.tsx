import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {FsrsState, LearningStatus, Word} from '../types';
import {VocabularyLibraryView} from './VocabularyLibraryView';

interface WordOptions {
  id: string;
  word: string;
  learningStatus?: LearningStatus;
  fsrsState?: FsrsState;
  nextReviewDates?: string[];
}

const makeWord = ({
  id,
  word,
  learningStatus = 'review',
  fsrsState = 2,
  nextReviewDates = ['2026-08-04T00:00:00.000Z'],
}: WordOptions): Word => ({
  id,
  word,
  wordStructure: [],
  wordFamily: [],
  isGlobal: false,
  approvalStatus: 'approved',
  createdBy: 'user-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  deckId: 'deck-1',
  tags: [],
  status: 'active',
  meanings: nextReviewDates.map((nextReviewDate, index) => ({
    id: `${id}-meaning-${index}`,
    wordId: id,
    meaning: `Nghĩa ${word} ${index + 1}`,
    partOfSpeech: 'noun',
    exampleSentences: [],
    memoryStrength: 'stable',
    memoryScore: 70,
    fsrsState,
    learningStatus,
    reviewIntervalDays: 1,
    nextReviewDate,
    firstAttemptErrorRate: 0,
    forgottenWordParts: [],
    history: [],
  })),
});

const makeTwentyOneWords = () =>
  Array.from({length: 21}, (_, index) => {
    const number = index + 1;
    return makeWord({
      id: `word-${number}`,
      word: `word-${String(number).padStart(2, '0')}`,
      nextReviewDates: [
        `2026-08-${String(number).padStart(2, '0')}T00:00:00.000Z`,
      ],
    });
  });

const renderLibrary = (words: Word[]) =>
  render(
    <VocabularyLibraryView
      words={words}
      decks={[
        {
          id: 'deck-1',
          name: 'General',
          color: '#4f46e5',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ]}
      tags={[]}
      onOpenAddWordModal={vi.fn()}
      onOpenWordDetail={vi.fn()}
      onUpdateWordStatus={vi.fn().mockResolvedValue(true)}
      onBulkUpdateStatus={vi.fn().mockResolvedValue(true)}
      onBulkMoveDeck={vi.fn().mockResolvedValue(true)}
      onDeleteWord={vi.fn().mockResolvedValue(true)}
    />,
  );

afterEach(cleanup);

describe('VocabularyLibraryView', () => {
  it('counts unlearned new words independently of the current filter', () => {
    renderLibrary([
      makeWord({
        id: 'new-status',
        word: 'alpha',
        learningStatus: 'new',
        fsrsState: 1,
      }),
      makeWord({
        id: 'new-fsrs',
        word: 'beta',
        learningStatus: 'review',
        fsrsState: 0,
      }),
      makeWord({
        id: 'learned',
        word: 'gamma',
        learningStatus: 'review',
        fsrsState: 2,
      }),
    ]);

    expect(screen.getByText('Từ mới chưa học: 2')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), {target: {value: 'gamma'}});
    expect(screen.getByText('Từ mới chưa học: 2')).toBeInTheDocument();
  });

  it('orders words by their earliest valid review date and puts invalid dates last', () => {
    renderLibrary([
      makeWord({
        id: 'invalid',
        word: 'invalid',
        nextReviewDates: ['not-a-date'],
      }),
      makeWord({
        id: 'later',
        word: 'later',
        nextReviewDates: ['2026-08-10T00:00:00.000Z'],
      }),
      makeWord({
        id: 'earlier',
        word: 'earlier',
        nextReviewDates: [
          '2026-08-09T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z',
        ],
      }),
    ]);

    expect(
      screen.getAllByTestId('vocabulary-word').map((node) => node.textContent),
    ).toEqual(['earlier', 'later', 'invalid']);
  });

  it('shows 20 rows per page and navigates to the remaining rows', () => {
    renderLibrary(makeTwentyOneWords());

    expect(screen.getAllByTestId('vocabulary-word')).toHaveLength(20);
    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Trang sau'}));

    expect(screen.getAllByTestId('vocabulary-word')).toHaveLength(1);
    expect(screen.getByText('word-21')).toBeInTheDocument();
    expect(screen.getByText('Trang 2 / 2')).toBeInTheDocument();
  });

  it('returns to page one when search changes and selects only visible rows', () => {
    renderLibrary(makeTwentyOneWords());
    fireEvent.click(screen.getByRole('button', {name: 'Trang sau'}));
    fireEvent.change(screen.getByRole('textbox'), {target: {value: 'word'}});

    expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Chọn tất cả từ trên trang này',
      }),
    );

    expect(screen.getByText('Đã chọn 20 từ')).toBeInTheDocument();
  });
});
