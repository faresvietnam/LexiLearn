import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { State } from 'ts-fsrs';
import { LearningSessionView } from './LearningSessionView';
import {
  scheduleCard,
  type LearningCardFsrsRow,
} from '../features/scheduling/fsrsScheduler';
import {
  MeaningCard,
  Question,
  SessionStats,
  StudyAttemptInput,
  UserSettings,
  Word,
} from '../types';

const meaningCard: MeaningCard = {
  id: 'meaning-remember',
  wordId: 'word-remember',
  meaning: 'nhớ',
  partOfSpeech: 'verb',
  exampleSentences: [],
  memoryStrength: 'stable',
  memoryScore: 60,
  reviewIntervalDays: 4,
  nextReviewDate: '2026-07-29',
  firstAttemptErrorRate: 0,
  forgottenWordParts: [],
  history: [],
};

const pendingWord: Word = {
  id: 'word-remember',
  word: 'remember',
  ipa: '/rɪˈmembər/',
  wordStructure: [],
  wordFamily: [],
  isGlobal: false,
  approvalStatus: 'pending',
  createdBy: 'learner-1',
  createdAt: '2026-07-29',
  deckId: 'deck-general',
  tags: [],
  status: 'active',
  meanings: [meaningCard],
};

const question: Question = {
  id: 'question-remember',
  word: pendingWord,
  targetMeaningCard: meaningCard,
  stage: 5,
  type: 'full_word_typing',
  prompt: 'Gõ từ có nghĩa là "nhớ"',
  expectedAnswer: 'remember',
};

const settings: UserSettings = {
  newWordsPerDay: 10,
  reviewLimitPerDay: 40,
  hintBehavior: 'auto',
  audioAutoplay: false,
  theme: 'light',
  language: 'vi',
  reducedMotion: false,
  charDiffAccessibility: true,
};

const newCardRow: LearningCardFsrsRow = {
  id: meaningCard.id,
  next_review_at: null,
  last_reviewed_at: null,
  fsrs_state_version: 1,
  fsrs_state: State.New,
  fsrs_stability: 0,
  fsrs_difficulty: 0,
  fsrs_elapsed_days: 0,
  fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0,
  fsrs_reps: 0,
  fsrs_lapses: 0,
  fsrs_retrievability: 1,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LearningSessionView session completion', () => {
  it('leaves legacy heuristic scheduling fields unchanged for an FSRS review', () => {
    let updatedCard: MeaningCard | undefined;

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={(_wordId, _meaningCardId, card) => {
          updatedCard = card;
        }}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'), {
      target: {value: 'remember'},
    });
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));

    expect(updatedCard).toMatchObject({
      memoryStrength: 'stable',
      memoryScore: 60,
      reviewIntervalDays: 4,
      nextReviewDate: '2026-07-29',
      history: [expect.objectContaining({isFirstAttemptCorrect: true})],
    });
  });

  it('keeps failed-attempt errors in the updated card and reports retry session stats', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));

    let finishedStats: SessionStats | undefined;
    let updatedCard: MeaningCard | undefined;
    let updatedWordId: string | undefined;
    let updatedMeaningCardId: string | undefined;

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview
        onMeaningCardUpdated={(wordId, meaningCardId, card) => {
          updatedWordId = wordId;
          updatedMeaningCardId = meaningCardId;
          updatedCard = card;
        }}
        onAttempt={() => undefined}
        onFinishSession={(stats) => {
          finishedStats = stats;
        }}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remmber' } });
    vi.setSystemTime(new Date('2026-07-29T10:00:08.000Z'));
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    vi.setSystemTime(new Date('2026-07-29T10:00:12.000Z'));
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    expect(updatedWordId).toBe('word-remember');
    expect(updatedMeaningCardId).toBe('meaning-remember');
    expect(updatedCard?.history).toHaveLength(1);
    expect(updatedCard?.history[0]).toMatchObject({
      isFirstAttemptCorrect: false,
      attemptsCount: 2,
      responseTimeMs: 12_000,
      errorTypes: expect.arrayContaining(['Replacement']),
    });

    vi.setSystemTime(new Date('2026-07-29T10:00:30.000Z'));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(finishedStats).toEqual({
      reviewsCompleted: 1,
      newWordsLearned: 1,
      firstAttemptAccuracy: 0,
      studyTimeSeconds: 30,
      retriesTotal: 1,
      extraReviewMode: true,
    });
  });

  it('counts a correct first try on the final question in session accuracy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T11:00:00.000Z'));

    let finishedStats: SessionStats | undefined;

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={(stats) => {
          finishedStats = stats;
        }}
        onExitSession={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'), {
      target: { value: 'remember' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(finishedStats?.firstAttemptAccuracy).toBe(100);
  });

  it('records a keyboard hint before Enter checks an already typed answer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));

    let updatedCard: MeaningCard | undefined;

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={(_wordId, _meaningCardId, card) => {
          updatedCard = card;
        }}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'), {
      target: { value: 'remember' },
    });
    fireEvent.keyDown(window, { key: 'h' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(updatedCard?.history[0].hintLevelUsed).toBe(1);
  });

  it('accepts outer whitespace in word-part typing like the character diff normalizer', () => {
    const wordPartQuestion: Question = {
      ...question,
      id: 'question-remember-parts',
      stage: 3,
      type: 'word_part_typing',
      wordParts: [
        {
          id: 'part-remember',
          text: 'remember',
          type: 'root',
          order: 1,
        },
      ],
    };
    let updatedCard: MeaningCard | undefined;

    render(
      <LearningSessionView
        questions={[wordPartQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={(_wordId, _meaningCardId, card) => {
          updatedCard = card;
        }}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('root'), {
      target: { value: ' remember ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    expect(updatedCard?.history[0]).toMatchObject({
      isFirstAttemptCorrect: true,
      attemptsCount: 1,
      errorTypes: [],
    });
  });

  it('shows the two Git-style comparison rows after an incorrect typed answer', () => {
    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'), {
      target: { value: 'remmber' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    expect(screen.getByText('- Bạn nhập:')).toBeInTheDocument();
    expect(screen.getByText('+ Đáp án:')).toBeInTheDocument();
  });

  it('does not show the comparison rows after a correct typed answer', () => {
    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'), {
      target: { value: 'remember' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    expect(screen.queryByText('- Bạn nhập:')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Đáp án:')).not.toBeInTheDocument();
  });
});

describe('LearningSessionView attempt persistence contract', () => {
  it('rates a completed retry Again and renders its FSRS prediction in Answer Review', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T05:00:00.000Z'));
    const ratings: string[] = [];

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={async (_cardId, rating, reviewedAt) => {
          ratings.push(rating);
          return scheduleCard(newCardRow, rating, reviewedAt);
        }}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    );
    fireEvent.change(answerInput, {target: {value: 'remmber'}});
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));
    fireEvent.click(screen.getByRole('button', {name: /Thử lại/i}));
    fireEvent.change(answerInput, {target: {value: 'remember'}});

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: /Check/i}));
      await Promise.resolve();
    });

    expect(ratings).toEqual(['Again']);
    expect(screen.getByText('Predicted recall: 100%')).toBeInTheDocument();
    expect(screen.getByText('Review again: in 10 minutes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: /Tiếp tục/i}),
    ).toBeInTheDocument();
  });

  it('emits two ordered immutable attempt records for a retry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T13:00:00.000Z'));
    const attempts: StudyAttemptInput[] = [];

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={(attempt) => {
          attempts.push(attempt);
        }}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    );
    fireEvent.change(answerInput, {target: {value: 'remmber'}});
    vi.setSystemTime(new Date('2026-07-29T13:00:08.000Z'));
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));

    fireEvent.click(screen.getByRole('button', {name: /Thử lại/i}));
    fireEvent.click(screen.getByRole('button', {name: /Gợi ý/i}));
    fireEvent.click(screen.getByRole('button', {name: /Đã hiểu/i}));
    fireEvent.change(answerInput, {target: {value: 'remember'}});
    vi.setSystemTime(new Date('2026-07-29T13:00:12.000Z'));
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));

    expect(attempts).toEqual([
      {
        learningCardId: 'meaning-remember',
        questionType: 'full_word_typing',
        inputMode: 'typing',
        attemptNumber: 1,
        submittedAnswer: 'remmber',
        isCorrect: false,
        firstAttempt: true,
        responseTimeMs: 8_000,
        hintLevel: 0,
        answerRevealed: false,
        errorTypes: ['Replacement', 'Missing character'],
      },
      {
        learningCardId: 'meaning-remember',
        questionType: 'full_word_typing',
        inputMode: 'typing',
        attemptNumber: 2,
        submittedAnswer: 'remember',
        isCorrect: true,
        firstAttempt: false,
        responseTimeMs: 12_000,
        hintLevel: 1,
        answerRevealed: false,
        errorTypes: [],
      },
    ]);
  });

  it('keeps the local retry and completion flow when attempt persistence rejects', async () => {
    vi.useFakeTimers();
    const onFinishSession = vi.fn();

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => Promise.reject(new Error('write failed'))}
        onFinishSession={onFinishSession}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    );
    fireEvent.change(answerInput, {target: {value: 'wrong'}});
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));
    expect(
      screen.getByRole('button', {name: /Thử lại/i}),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: /Thử lại/i}));
    fireEvent.change(answerInput, {target: {value: 'remember'}});
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));
    expect(
      screen.getByRole('button', {name: /Tiếp tục/i}),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/i}));
    await Promise.resolve();

    expect(onFinishSession).toHaveBeenCalledOnce();
  });
});
