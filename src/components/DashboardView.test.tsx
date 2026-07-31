import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Word} from '../types';
import {INITIAL_SETTINGS, INITIAL_STUDY_SCOPE} from '../data/mockData';
import {DashboardView} from './DashboardView';

const makeWord = (state: 0 | 1 | 2 | 3, nextReviewDate: string): Word => ({
  id: 'word-review', word: 'review', wordStructure: [], wordFamily: [], isGlobal: false,
  approvalStatus: 'approved', createdBy: 'user-1', createdAt: '2026-01-01', deckId: 'deck_general', tags: [], status: 'active',
  meanings: [{id: 'card-review', wordId: 'word-review', meaning: 'ôn tập', partOfSpeech: 'verb', exampleSentences: [],
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
  it('shows the earliest scheduled review instead of estimated session duration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    renderDashboard([makeWord(2, '2026-07-31T06:45:00.000Z')]);
    expect(screen.getByText('Ôn lại sau')).toBeInTheDocument();
    expect(screen.getByText('2 giờ')).toBeInTheDocument();
    expect(screen.queryByText('Thời gian ước tính')).not.toBeInTheDocument();
  });

  it('shows due and no-schedule states', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T05:00:00.000Z'));
    renderDashboard([makeWord(2, '2026-07-31T04:59:00.000Z')]);
    expect(screen.getByText('0 giờ')).toBeInTheDocument();
    cleanup();
    renderDashboard([makeWord(0, '2026-07-31T06:00:00.000Z')]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
