import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  INITIAL_DECKS,
  INITIAL_SETTINGS,
  INITIAL_STUDY_SCOPE,
  INITIAL_TAGS,
  INITIAL_WORDS,
} from './data/mockData';

const {
  completeStudySession,
  createPrivateWord,
  createStudySession,
  getLearningCardSchedule,
  getDailyNewWordUsage,
  getStudyAttemptAnalytics,
  loadLearnerState,
  pauseStudySession,
  signOut,
  supabaseClient,
  submitLearningReview,
  authState,
} = vi.hoisted(() => ({
  completeStudySession: vi.fn(),
  createPrivateWord: vi.fn(),
  createStudySession: vi.fn(),
  getLearningCardSchedule: vi.fn(),
  getDailyNewWordUsage: vi.fn(),
  getStudyAttemptAnalytics: vi.fn(),
  loadLearnerState: vi.fn(),
  pauseStudySession: vi.fn(),
  signOut: vi.fn(),
  supabaseClient: {},
  submitLearningReview: vi.fn(),
  authState: {
    userId: 'user-1',
  },
}));

vi.mock('./features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    roles: ['learner'],
    user: {
      id: authState.userId,
      email: 'learner@example.com',
      user_metadata: {},
    },
    signOut,
  }),
}));

vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => supabaseClient,
}));

vi.mock('./features/persistence/vocabularyRepository', async (importOriginal) => ({
  ...await importOriginal<
    typeof import('./features/persistence/vocabularyRepository')
  >(),
  createPrivateWord,
  loadLearnerState,
}));

vi.mock('./features/persistence/sessionRepository', () => ({
  completeStudySession,
  createStudySession,
  getLearningCardSchedule,
  getDailyNewWordUsage,
  getStudyAttemptAnalytics,
  pauseStudySession,
  submitLearningReview,
}));

import App from './App';

type SessionResult =
  | {data: string; error: null}
  | {data: null; error: string};

function deferredSessionResult() {
  let resolve!: (result: SessionResult) => void;
  const promise = new Promise<SessionResult>((next) => {
    resolve = next;
  });
  return {promise, resolve};
}

beforeEach(() => {
  authState.userId = 'user-1';
  createStudySession.mockReset();
  createPrivateWord.mockReset();
  completeStudySession.mockReset();
  getLearningCardSchedule.mockReset();
  pauseStudySession.mockReset();
  getDailyNewWordUsage.mockReset();
  submitLearningReview.mockReset();
  loadLearnerState.mockReset();
  loadLearnerState.mockResolvedValue({
    data: {
      settings: INITIAL_SETTINGS,
      studyScope: INITIAL_STUDY_SCOPE,
      decks: INITIAL_DECKS,
      tags: INITIAL_TAGS,
      words: INITIAL_WORDS,
      globalWords: [],
    },
    error: null,
  });
  completeStudySession.mockResolvedValue({data: null, error: null});
  pauseStudySession.mockResolvedValue({data: null, error: null});
  getDailyNewWordUsage.mockResolvedValue({data: 0, error: null});
  getLearningCardSchedule.mockResolvedValue({
    data: {
      id: 'meaning_unprecedented_1',
      next_review_at: null,
      last_reviewed_at: null,
      fsrs_state_version: 1,
      fsrs_state: 0,
      fsrs_stability: 0,
      fsrs_difficulty: 0,
      fsrs_elapsed_days: 0,
      fsrs_scheduled_days: 0,
      fsrs_learning_steps: 0,
      fsrs_reps: 0,
      fsrs_lapses: 0,
      fsrs_retrievability: 1,
    },
    error: null,
  });
  getStudyAttemptAnalytics.mockResolvedValue({data: [], error: null});
  submitLearningReview.mockResolvedValue({data: null, error: null});
  createPrivateWord.mockImplementation(async (_userId, word) => ({
    data: word,
    error: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('App session creation concurrency', () => {
  it('creates exactly one session for two starts in the same render batch', async () => {
    const pending = deferredSessionResult();
    createStudySession.mockReturnValue(pending.promise);
    render(<App />);

    const startButton = await screen.findByRole('button', {
      name: 'Continue Learning',
    });

    act(() => {
      startButton.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      startButton.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });

    await waitFor(() => expect(createStudySession).toHaveBeenCalledOnce());
    expect(startButton).toBeDisabled();
    expect(
      screen.getByRole('button', {name: 'Học ngay'}),
    ).toBeDisabled();
    screen.getAllByRole('button', {name: 'Practice'}).forEach((button) => {
      expect(button).toBeDisabled();
    });

    await act(async () => {
      pending.resolve({data: 'session-1', error: null});
      await pending.promise;
    });

    expect(await screen.findByText(/Câu 1 \//)).toBeInTheDocument();
    expect(createStudySession).toHaveBeenCalledOnce();
  });

  it('releases the start lock after a failed write so a later retry can create', async () => {
    const pending = deferredSessionResult();
    createStudySession
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({data: 'session-2', error: null});
    render(<App />);

    const startButton = await screen.findByRole('button', {
      name: 'Continue Learning',
    });
    fireEvent.click(startButton);
    await waitFor(() => expect(startButton).toBeDisabled());

    await act(async () => {
      pending.resolve({
        data: null,
        error: 'Không thể lưu phiên học. Tiến trình cục bộ vẫn được giữ.',
      });
      await pending.promise;
    });

    fireEvent.click(await screen.findByTitle('Pause Session (Esc)'));
    fireEvent.click(screen.getByRole('button', {name: 'Thoát về Dashboard'}));

    const retryButton = await screen.findByRole('button', {
      name: 'Continue Learning',
    });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(createStudySession).toHaveBeenCalledTimes(2);
    });
  });
});

describe('App insufficient-card session start', () => {
  it('shows a generic not-enough-cards message when fewer than 5 cards are already due', async () => {
    loadLearnerState.mockResolvedValue({
      data: {
        settings: INITIAL_SETTINGS,
        studyScope: INITIAL_STUDY_SCOPE,
        decks: INITIAL_DECKS,
        tags: INITIAL_TAGS,
        words: [
          {
            ...INITIAL_WORDS[0],
            id: 'only-word-1',
            meanings: [{
              ...INITIAL_WORDS[0].meanings[0],
              id: 'only-meaning-1',
              wordId: 'only-word-1',
              nextReviewDate: '2000-01-01',
              history: [],
            }],
          },
        ],
        globalWords: [],
      },
      error: null,
    });
    render(<App />);

    const startButton = await screen.findByRole('button', { name: 'Continue Learning' });
    fireEvent.click(startButton);

    expect(
      await screen.findByText(/Chưa đủ từ vựng cần học trong Study Scope hiện tại/),
    ).toBeInTheDocument();
  });

  it('shows a countdown when the not-enough-cards session has only future-due cards', async () => {
    const futureIso = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    loadLearnerState.mockResolvedValue({
      data: {
        settings: INITIAL_SETTINGS,
        studyScope: INITIAL_STUDY_SCOPE,
        decks: INITIAL_DECKS,
        tags: INITIAL_TAGS,
        words: [
          {
            ...INITIAL_WORDS[0],
            id: 'future-word-1',
            meanings: [{
              ...INITIAL_WORDS[0].meanings[0],
              id: 'future-meaning-1',
              wordId: 'future-word-1',
              fsrsState: 2,
              nextReviewDate: futureIso,
              history: [{
                id: 'h-future-1',
                date: '2026-07-01T00:00:00.000Z',
                stage: 1,
                isFirstAttemptCorrect: true,
                attemptsCount: 1,
                hintLevelUsed: 0,
                responseTimeMs: 1000,
                errorTypes: [],
              }],
            }],
          },
        ],
        globalWords: [],
      },
      error: null,
    });
    render(<App />);

    const startButton = await screen.findByRole('button', { name: 'Continue Learning' });
    fireEvent.click(startButton);

    expect(
      await screen.findByText(/Chưa đủ từ vựng cần học.*quay lại sau/),
    ).toBeInTheDocument();
  });
});

describe('App authenticated identity state', () => {
  it('does not carry an active learning session into a different user identity', async () => {
    createStudySession.mockResolvedValue({data: 'session-1', error: null});
    const {rerender} = render(<App />);

    fireEvent.click(
      await screen.findByRole('button', {name: 'Continue Learning'}),
    );
    expect(await screen.findByText(/Câu 1 \//)).toBeInTheDocument();

    authState.userId = 'user-2';
    rerender(<App />);

    expect(
      await screen.findByRole('heading', {
        name: 'Sẵn sàng học bài hôm nay!',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Câu 1 \//)).not.toBeInTheDocument();
    expect(loadLearnerState).toHaveBeenLastCalledWith('user-2');
  });
});

describe('App FSRS review scheduling', () => {
  it('updates the existing MeaningCard strength from a successful FSRS review', async () => {
    createStudySession.mockResolvedValue({data: 'session-1', error: null});
    submitLearningReview.mockResolvedValue({data: null, error: null});
    render(<App />);

    fireEvent.click(
      await screen.findByRole('button', {name: 'Continue Learning'}),
    );
    await screen.findByText(/Câu 1 \//);
    const correctAnswer = screen.getByRole('button', {
      name: /Chưa từng có tiền lệ/,
    });
    fireEvent.click(correctAnswer);
    await waitFor(() => {
      expect(correctAnswer).toHaveClass('border-indigo-500');
    });
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));

    expect(
      await screen.findByText('Predicted recall: 95%'),
    ).toBeInTheDocument();
    expect(submitLearningReview).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      sessionId: 'session-1',
      learningCardId: 'meaning_unprecedented_1',
      isNewWord: false,
      schedule: expect.objectContaining({
        memory_score: 95,
        memory_strength: 'strong',
      }),
    }));
  });

  it('persists a completed retry schedule while a rejected write leaves Answer Review usable', async () => {
    createStudySession.mockResolvedValue({data: 'session-1', error: null});
    submitLearningReview.mockResolvedValue({data: null, error: 'Không thể lưu lần trả lời. Tiến trình cục bộ vẫn được giữ.'});
    render(<App />);

    fireEvent.click(
      await screen.findByRole('button', {name: 'Continue Learning'}),
    );
    await screen.findByText(/Câu 1 \//);

    fireEvent.click(screen.getByRole('button', {
      name: /Giao thông vận tải, sự vận chuyển/,
    }));
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));
    fireEvent.click(screen.getByRole('button', {name: /Thử lại/i}));
    fireEvent.click(screen.getByRole('button', {
      name: /Chưa từng có tiền lệ/,
    }));
    fireEvent.click(screen.getByRole('button', {name: /Check/i}));

    expect(await screen.findByText('Không thể lưu lần trả lời. Tiến trình cục bộ vẫn được giữ.')).toBeInTheDocument();
    expect(screen.getByText('Chưa lưu được tiến trình ôn tập. Hãy thử lại trước khi tiếp tục.')).toBeInTheDocument();

    expect(getLearningCardSchedule).toHaveBeenCalledWith(
      'user-1',
      'meaning_unprecedented_1',
    );
    expect(submitLearningReview).toHaveBeenCalled();
  });
});

describe('App private vocabulary creation', () => {
  it('does not call create_private_word for an existing private word', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Thêm từ mới'));
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: ' Unprecedented '},
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Giao thông vận tải'), {
      target: {value: 'chưa từng có tiền lệ'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    await waitFor(() => {
      expect(createPrivateWord).not.toHaveBeenCalled();
    });
  });
});
