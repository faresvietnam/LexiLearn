import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { State } from 'ts-fsrs';
import { LearningSessionView, maskSentenceAnswer } from './LearningSessionView';
import {
  scheduleCard,
  type LearningCardFsrsRow,
} from '../features/scheduling/fsrsScheduler';
import type {AutomaticRating} from '../features/scheduling/automaticRating';
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
  fsrsState: 0,
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
  aiProvider: 'gemini',
  geminiApiKey: null,
  openAICompatibleBaseUrl: '',
  openAICompatibleTokenConfigured: false,
  openAICompatibleModel: '',
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

function buildFillerQuestion(index: number): Question {
  const fillerMeaning: MeaningCard = {
    ...meaningCard,
    id: `meaning-filler-${index}`,
  };
  const fillerWord: Word = {
    ...pendingWord,
    id: `word-filler-${index}`,
    word: `filler${index}`,
    meanings: [fillerMeaning],
  };
  return {
    id: `question-filler-${index}`,
    word: fillerWord,
    targetMeaningCard: fillerMeaning,
    stage: 1,
    type: 'en_to_vn_mc',
    prompt: `Chọn nghĩa đúng cho filler ${index}`,
    mcOptions: [
      {
        id: 'opt_correct',
        label: `Đáp án đúng ${index}`,
        isCorrect: true,
        keyShortcut: '1',
      },
    ],
    expectedAnswer: `filler${index}`,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LearningSessionView session completion', () => {
  it('shows every meaning with all three examples in the correct-answer overlay', () => {
    const rememberExamples = [
      'I remember my first teacher.',
      'Please remember to lock the door.',
      'She remembers his name clearly.',
    ].map((sentence, index) => ({
      id: `remember-example-${index}`,
      meaningCardId: meaningCard.id,
      sentence,
      expectedAnswer: 'remember',
      baseWord: 'remember',
      wordForm: 'base',
      partOfSpeech: 'verb',
      difficulty: 'medium' as const,
      approvalStatus: 'approved' as const,
    }));
    const remembranceMeaning: MeaningCard = {
      ...meaningCard,
      id: 'meaning-remembrance',
      meaning: 'lễ tưởng niệm',
      partOfSpeech: 'noun',
      definitionEn: 'an act of remembering and honoring someone',
      exampleSentences: [
        'They held a service of remembrance.',
        'The monument stands in remembrance of the victims.',
        'A minute of remembrance followed the speech.',
      ].map((sentence, index) => ({
        id: `remembrance-example-${index}`,
        meaningCardId: 'meaning-remembrance',
        sentence,
        expectedAnswer: 'remembrance',
        baseWord: 'remember',
        wordForm: 'noun',
        partOfSpeech: 'noun',
        difficulty: 'medium' as const,
        approvalStatus: 'approved' as const,
      })),
    };
    const testedMeaning: MeaningCard = {
      ...meaningCard,
      definitionEn: 'to keep information in your mind',
      exampleSentences: rememberExamples,
    };
    const reviewQuestion: Question = {
      ...question,
      word: {
        ...pendingWord,
        meanings: [testedMeaning, remembranceMeaning],
      },
      targetMeaningCard: testedMeaning,
    };

    render(
      <LearningSessionView
        questions={[reviewQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'), {
      target: {value: 'remember'},
    });
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));

    expect(screen.getByRole('heading', {name: 'Chính xác!'})).toBeInTheDocument();
    expect(screen.getByText('to keep information in your mind')).toBeInTheDocument();
    expect(screen.getByText('an act of remembering and honoring someone')).toBeInTheDocument();
    for (const sentence of [
      ...rememberExamples.map(({sentence}) => sentence),
      ...remembranceMeaning.exampleSentences.map(({sentence}) => sentence),
    ]) {
      expect(screen.getByText(sentence)).toBeInTheDocument();
    }
  });

  it('recreates multiple-choice buttons between questions so interaction state cannot leak', () => {
    const firstQuestion: Question = {
      ...question,
      id: 'question-remember-mc',
      type: 'vn_to_en_mc',
      prompt: 'Chọn từ có nghĩa là "nhớ"',
      mcOptions: [
        {id: 'opt_correct', label: 'remember', isCorrect: true, keyShortcut: '1'},
        {id: 'opt_d_0', label: 'forget', isCorrect: false, keyShortcut: '2'},
      ],
    };
    const secondQuestion: Question = {
      ...firstQuestion,
      id: 'question-recall-mc',
      prompt: 'Chọn từ có nghĩa là "nhớ lại"',
      expectedAnswer: 'recall',
      mcOptions: [
        {id: 'opt_correct', label: 'recall', isCorrect: true, keyShortcut: '1'},
        {id: 'opt_d_0', label: 'ignore', isCorrect: false, keyShortcut: '2'},
      ],
    };

    render(
      <LearningSessionView
        questions={[firstQuestion, secondQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />,
    );

    const firstCorrectButton = screen.getByRole('button', {name: /remember/i});
    fireEvent.click(firstCorrectButton);
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));
    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/i}));

    expect(screen.getByRole('button', {name: /recall/i})).not.toBe(
      firstCorrectButton,
    );
  });

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

    // No onReviewCompleted is wired up, so there is no schedule to trigger
    // a reinsertion — the single-question session finishes right away.
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

  it('does not intercept the H key while typing an answer', () => {
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

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.keyDown(answerInput, {key: 'h'});

    expect(screen.queryByText(/Gợi ý - Level/)).not.toBeInTheDocument();
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

    const rootInput = screen.getByPlaceholderText('root');
    expect(rootInput).toHaveFocus();
    fireEvent.change(rootInput, {
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

  it('clears the typed answer back to blank when retrying via the Retry button', () => {
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

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    ) as HTMLInputElement;
    fireEvent.change(answerInput, { target: { value: 'remmber' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    expect(answerInput.value).toBe('remmber');

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));

    expect(answerInput.value).toBe('');
  });

  it('clears the typed answer back to blank when retrying with Enter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T07:00:00.000Z'));

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

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    ) as HTMLInputElement;
    fireEvent.change(answerInput, { target: { value: 'remmber' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    // Past the key-repeat debounce window, so this Enter is a real retry.
    vi.setSystemTime(new Date('2026-07-30T07:00:01.000Z'));
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(answerInput.value).toBe('');
  });

  it('clears word-part typing inputs back to blank when retrying a wrong attempt', () => {
    const wordPartQuestion: Question = {
      ...question,
      id: 'question-remember-parts-retry',
      stage: 3,
      type: 'word_part_typing',
      wordParts: [
        { id: 'part-remember', text: 'remember', type: 'root', order: 1 },
      ],
    };

    render(
      <LearningSessionView
        questions={[wordPartQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const rootInput = screen.getByPlaceholderText('root') as HTMLInputElement;
    fireEvent.change(rootInput, { target: { value: 'remmber' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    expect(rootInput.value).toBe('remmber');

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));

    expect(rootInput.value).toBe('');
  });

  it('ignores an Enter that arrives immediately after a wrong check so the diff stays readable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T08:00:00.000Z'));

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

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    ) as HTMLInputElement;
    fireEvent.change(answerInput, { target: { value: 'remmber' } });
    fireEvent.keyDown(window, { key: 'Enter' });

    // A second Enter landing in the same instant (key repeat, or a
    // reflexive double-tap) must not wipe the answer or the diff.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(answerInput.value).toBe('remmber');
    expect(screen.getByText('- Bạn nhập:')).toBeInTheDocument();

    // An Enter that arrives after the debounce window is a real retry.
    vi.setSystemTime(new Date('2026-07-30T08:00:01.000Z'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(answerInput.value).toBe('');
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

  it('continues with Enter after the asynchronous FSRS review finishes saving', async () => {
    const onFinishSession = vi.fn();

    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={async (_cardId, rating, reviewedAt) =>
          scheduleCard(newCardRow, rating, reviewedAt)}
        onFinishSession={onFinishSession}
        onExitSession={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    ), {target: {value: 'remember'}});

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: /Check/i}));
      await Promise.resolve();
    });

    expect(screen.getByText(/Predicted recall:/i)).toBeInTheDocument();
    fireEvent.keyDown(window, {key: 'Enter'});

    expect(onFinishSession).toHaveBeenCalledOnce();
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

    // No onReviewCompleted is wired up, so there is no schedule to trigger
    // a reinsertion — the single-question session finishes immediately.
    expect(onFinishSession).toHaveBeenCalledOnce();
  });
});

function buildScheduleForTarget(minutesFromReview: number) {
  return async (
    cardId: string,
    rating: AutomaticRating,
    reviewedAt: Date,
  ) => {
    const scheduled = scheduleCard(newCardRow, rating, reviewedAt);
    const isTarget = cardId === meaningCard.id;
    scheduled.card.due = new Date(
      reviewedAt.getTime() + (isTarget ? minutesFromReview : 2 * 24 * 60) * 60_000,
    );
    return scheduled;
  };
}

describe('LearningSessionView FSRS-driven in-session reinsertion', () => {
  it('reinserts a question 3 questions later when its resolved schedule is within the short-term window', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) => buildFillerQuestion(i + 1));

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(10)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`Đáp án đúng ${i + 1}`) }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Check/i }));
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    expect(screen.getByText('Câu 5 / 8')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'),
    ).toBeInTheDocument();
  });

  it('keeps reinserting the same card with no cap while its schedule stays within the window', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) => buildFillerQuestion(i + 1));

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(10)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`Đáp án đúng ${i + 1}`) }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Check/i }));
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    expect(screen.getByText('Câu 5 / 8')).toBeInTheDocument();
    const secondPass = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(secondPass, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(screen.getByText('Câu 6 / 9')).toBeInTheDocument();
  });

  it('does not reinsert when the resolved schedule is beyond the short-term window', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) => buildFillerQuestion(i + 1));

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(2 * 24 * 60)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(screen.getByText('Câu 2 / 7')).toBeInTheDocument();
  });

  it('appends the reinsertion at the tail when fewer than 3 questions remain', async () => {
    const singleFiller = [buildFillerQuestion(1)];

    render(
      <LearningSessionView
        questions={[question, ...singleFiller]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(10)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Only 1 question (the filler) was ahead of the target, fewer than the
    // 3 needed for a full gap, so the clone lands right after it — at the
    // tail of the queue — instead of exactly 3 questions later.
    expect(screen.getByText('Câu 2 / 3')).toBeInTheDocument();
  });

  it('shows the Vietnamese sentence translation under a sentence_completion question when present', () => {
    const sentenceCompletionQuestion: Question = {
      ...question,
      type: 'sentence_completion',
      prompt: 'Hoàn thành câu bằng từ hoặc dạng từ thích hợp:',
      exampleSentence: {
        id: 'ex-1',
        meaningCardId: meaningCard.id,
        sentence: 'I always _____ my keys.',
        sentenceVi: 'Tôi luôn nhớ chìa khóa của mình.',
        expectedAnswer: 'remember',
        baseWord: 'remember',
        wordForm: 'base',
        partOfSpeech: 'verb',
        difficulty: 'medium',
        approvalStatus: 'approved',
      },
    };

    render(
      <LearningSessionView
        questions={[sentenceCompletionQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />,
    );

    expect(screen.getByText('Tôi luôn nhớ chìa khóa của mình.')).toBeInTheDocument();
  });

  it('omits the translation line when the example sentence has no Vietnamese translation', () => {
    const sentenceCompletionQuestion: Question = {
      ...question,
      type: 'sentence_completion',
      prompt: 'Hoàn thành câu bằng từ hoặc dạng từ thích hợp:',
      exampleSentence: {
        id: 'ex-2',
        meaningCardId: meaningCard.id,
        sentence: 'I always _____ my keys.',
        expectedAnswer: 'remember',
        baseWord: 'remember',
        wordForm: 'base',
        partOfSpeech: 'verb',
        difficulty: 'medium',
        approvalStatus: 'approved',
      },
    };

    render(
      <LearningSessionView
        questions={[sentenceCompletionQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />,
    );

    expect(screen.getByText('I always _____ my keys.', {exact: false})).toBeInTheDocument();
    expect(screen.queryByText(/nhớ chìa khóa/)).not.toBeInTheDocument();
  });
});

describe('maskSentenceAnswer', () => {
  it('leaves an already-blanked sentence untouched', () => {
    expect(maskSentenceAnswer('The goods were _____ by truck.', 'transport'))
      .toBe('The goods were _____ by truck.');
  });

  it('blanks an exact whole-word match', () => {
    expect(maskSentenceAnswer('I always play tennis.', 'play'))
      .toBe('I always _____ tennis.');
  });

  it('blanks an inflected form of the answer (AI sentences rarely use the base form)', () => {
    expect(maskSentenceAnswer('The goods were transported by truck.', 'transport'))
      .toBe('The goods were _____ by truck.');
    expect(maskSentenceAnswer('She is running every morning.', 'run'))
      .toBe('She is _____ every morning.');
  });

  it('still shows a blank when the answer is not found in the sentence at all', () => {
    expect(maskSentenceAnswer('This sentence has nothing to do with it.', 'unrelated'))
      .toBe('This sentence has nothing to do with _____.');
  });
});
