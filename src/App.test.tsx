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
  createStudySession,
  getLearningCardSchedule,
  loadLearnerState,
  pauseStudySession,
  recordStudyAttempt,
  signOut,
  supabaseClient,
  updateLearningCardSchedule,
  authState,
} = vi.hoisted(() => ({
  completeStudySession: vi.fn(),
  createStudySession: vi.fn(),
  getLearningCardSchedule: vi.fn(),
  loadLearnerState: vi.fn(),
  pauseStudySession: vi.fn(),
  recordStudyAttempt: vi.fn(),
  signOut: vi.fn(),
  supabaseClient: {},
  updateLearningCardSchedule: vi.fn(),
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
  loadLearnerState,
}));

vi.mock('./features/persistence/sessionRepository', () => ({
  completeStudySession,
  createStudySession,
  getLearningCardSchedule,
  pauseStudySession,
  recordStudyAttempt,
  updateLearningCardSchedule,
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
  completeStudySession.mockReset();
  getLearningCardSchedule.mockReset();
  pauseStudySession.mockReset();
  recordStudyAttempt.mockReset();
  updateLearningCardSchedule.mockReset();
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
  recordStudyAttempt.mockResolvedValue({data: null, error: null});
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
  updateLearningCardSchedule.mockResolvedValue({data: null, error: null});
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

    expect(createStudySession).toHaveBeenCalledOnce();
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
    expect(startButton).toBeDisabled();

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
  it('persists a completed retry schedule while a rejected write leaves Answer Review usable', async () => {
    createStudySession.mockResolvedValue({data: 'session-1', error: null});
    updateLearningCardSchedule.mockRejectedValue(new Error('offline'));
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

    expect(
      await screen.findByText('Predicted recall: 100%'),
    ).toBeInTheDocument();
    expect(screen.getByText('Review again: in 10 minutes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: /Tiếp tục/i}),
    ).toBeInTheDocument();

    expect(getLearningCardSchedule).toHaveBeenCalledWith(
      'user-1',
      'meaning_unprecedented_1',
    );
    expect(updateLearningCardSchedule).toHaveBeenCalledWith(
      'user-1',
      'meaning_unprecedented_1',
      expect.objectContaining({
        fsrs_state_version: 1,
        fsrs_reps: 1,
        memory_score: 100,
      }),
    );
  });
});
