import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Word} from '../types';
import {INITIAL_SETTINGS, INITIAL_STUDY_SCOPE} from '../data/mockData';
import {DashboardView} from './DashboardView';

const makeWord = (id: string, state: 0 | 1 | 2 | 3, nextReviewDate: string): Word => ({
  id, word: id, wordStructure: [], wordFamily: [], isGlobal: false,
  approvalStatus: 'approved', createdBy: 'user-1', createdAt: '2026-01-01', deckId: 'deck_general', tags: [], status: 'active',
  meanings: [{id: `card-${id}`, wordId: id, meaning: 'ôn tập', partOfSpeech: 'verb', exampleSentences: [],
    memoryStrength: 'strong', memoryScore: 80, fsrsState: state, nextReviewDate, reviewIntervalDays: 1,
    firstAttemptErrorRate: 0, forgottenWordParts: [], history: []}],
});

const renderDashboard = (words: Word[]) => render(<DashboardView
  words={words}
  newWordsStartedToday={0}
  studyScope={INITIAL_STUDY_SCOPE}
  settings={INITIAL_SETTINGS}
  isSessionStartPending={false}
  onStartLearning={() => undefined}
  onOpenStudyScope={() => undefined}
  onOpenFilteredVocabulary={() => undefined}
  onPracticeWord={() => undefined}
/>);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Dashboard review countdown', () => {
  it('shows a countdown to when enough cards will be due, not just the single earliest one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    const dueWords = ['d1', 'd2', 'd3'].map((id) => makeWord(id, 2, '2026-07-31T04:00:00.000Z'));
    const futureWords = [
      makeWord('soon', 2, '2026-07-31T06:00:00.000Z'), // +1h
      makeWord('later', 2, '2026-07-31T08:00:00.000Z'), // +3h
    ];
    renderDashboard([...dueWords, ...futureWords]);
    expect(screen.getByText('Ôn lại sau')).toBeInTheDocument();
    // 3 already qualify; 2 more are needed to reach 5 — the 2nd-soonest
    // future card ("later", not "soon") is the one that closes the gap.
    expect(screen.getByText('3 giờ')).toBeInTheDocument();
  });

  it('shows ready-now once at least 5 cards already qualify', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    const words = ['a', 'b', 'c', 'd', 'e'].map((id) => makeWord(id, 2, '2026-07-31T04:00:00.000Z'));
    renderDashboard(words);
    expect(screen.getByText('0 giờ')).toBeInTheDocument();
  });

  it('shows — when there is not enough vocabulary in scope to ever reach 5', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    renderDashboard([makeWord('only', 2, '2026-07-31T04:00:00.000Z')]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
