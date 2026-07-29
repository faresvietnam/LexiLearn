import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningSessionView } from './LearningSessionView';
import { MeaningCard, Question, SessionStats, UserSettings, Word } from '../types';

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LearningSessionView session completion', () => {
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
});
