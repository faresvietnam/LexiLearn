import {beforeEach, describe, expect, it, vi} from 'vitest';
import {StudyAttemptInput, StudySessionInput} from '../../types';

const {from, rpc, getSupabaseClient} = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {
  completeStudySession,
  createStudySession,
  getLearningCardSchedule,
  getSentenceAttemptAnalytics,
  pauseStudySession,
  recordStudyAttempt,
  submitLearningReview,
  updateLearningCardSchedule,
} from './sessionRepository';

const sessionInput: StudySessionInput = {
  scopeSnapshot: {
    activeDeckIds: ['deck-1'],
    excludedTagIds: ['tag-2'],
    pausedWordIds: ['word-3'],
  },
  reviewLimit: 40,
  newWordLimit: 10,
};

const attemptInput: StudyAttemptInput = {
  learningCardId: 'card-1',
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
};

const cardSchedule = {
  next_review_at: '2026-08-09T05:00:00.000Z',
  last_reviewed_at: '2026-07-30T05:00:00.000Z',
  review_interval_days: 10,
  memory_score: 100,
  memory_strength: 'strong' as const,
  fsrs_state_version: 1 as const,
  fsrs_state: 2,
  fsrs_stability: 14.2,
  fsrs_difficulty: 4.8,
  fsrs_elapsed_days: 10,
  fsrs_scheduled_days: 10,
  fsrs_learning_steps: 0,
  fsrs_reps: 5,
  fsrs_lapses: 0,
  fsrs_retrievability: 1,
};

describe('session persistence repository', () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
    getSupabaseClient.mockReset();
    getSupabaseClient.mockReturnValue({from, rpc});
  });

  it('creates an active session from an immutable scope snapshot', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {id: 'session-1'},
      error: null,
    });
    const select = vi.fn(() => ({single}));
    const insert = vi.fn(() => ({select}));
    from.mockReturnValue({insert});

    await expect(createStudySession('user-1', sessionInput)).resolves.toEqual({
      data: 'session-1',
      error: null,
    });

    expect(from).toHaveBeenCalledWith('study_sessions');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      scope_snapshot: sessionInput.scopeSnapshot,
      review_limit: 40,
      new_word_limit: 10,
      status: 'active',
    });
    expect(select).toHaveBeenCalledWith('id');
  });

  it('inserts one immutable row for a checked answer', async () => {
    const insert = vi.fn().mockResolvedValue({error: null});
    from.mockReturnValue({insert});

    await expect(
      recordStudyAttempt('user-1', 'session-1', attemptInput),
    ).resolves.toEqual({data: null, error: null});

    expect(from).toHaveBeenCalledWith('study_attempts');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      session_id: 'session-1',
      learning_card_id: 'card-1',
      question_type: 'full_word_typing',
      input_mode: 'typing',
      attempt_number: 2,
      submitted_answer: 'remember',
      is_correct: true,
      first_attempt: false,
      response_time_ms: 12_000,
      hint_level: 1,
      answer_revealed: false,
      error_types: [],
      sentence_key: null,
    });
  });

  it('loads the complete owner-scoped FSRS state needed after reload', async () => {
    const row = {id: 'card-1', ...cardSchedule};
    const single = vi.fn().mockResolvedValue({data: row, error: null});
    const filterUser = vi.fn(() => ({single}));
    const filterId = vi.fn(() => ({eq: filterUser}));
    const select = vi.fn(() => ({eq: filterId}));
    from.mockReturnValue({select});

    await expect(
      getLearningCardSchedule('user-1', 'card-1'),
    ).resolves.toEqual({data: row, error: null});

    expect(from).toHaveBeenCalledWith('learning_cards');
    expect(select).toHaveBeenCalledWith(
      'id, next_review_at, last_reviewed_at, fsrs_state_version, fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps, fsrs_lapses, fsrs_retrievability, recognition_score, recall_score, spelling_score, context_score, word_structure_score, response_time_sample_count, response_time_average_ms',
    );
    expect(filterId).toHaveBeenCalledWith('id', 'card-1');
    expect(filterUser).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('submits attempts and the FSRS schedule through one RPC', async () => {
    rpc.mockResolvedValue({data: {event_id: 'event-1'}, error: null});

    await expect(submitLearningReview({
      userId: 'user-1',
      sessionId: 'session-1',
      learningCardId: 'card-1',
      idempotencyKey: 'session-1:card-1:1',
      isNewWord: true,
      studyDate: '2026-08-03',
      dailyLimit: 10,
      attempts: [attemptInput],
      schedule: cardSchedule,
    })).resolves.toEqual({data: null, error: null});

    expect(rpc).toHaveBeenCalledWith('submit_learning_review', {
      p_session_id: 'session-1',
      p_learning_card_id: 'card-1',
      p_idempotency_key: 'session-1:card-1:1',
      p_is_new_word: true,
      p_study_date: '2026-08-03',
      p_daily_limit: 10,
      p_attempts: [{
        learning_card_id: 'card-1',
        question_type: 'full_word_typing',
        input_mode: 'typing',
        attempt_number: 2,
        submitted_answer: 'remember',
        is_correct: true,
        first_attempt: false,
        response_time_ms: 12_000,
        hint_level: 1,
        answer_revealed: false,
        error_types: [],
        sentence_key: null,
      }],
      p_schedule: cardSchedule,
    });
  });

  it('loads only the authenticated user sentence attempts', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        sentence_key: 'sentence-1',
        is_correct: true,
        first_attempt: true,
        response_time_ms: 1200,
        created_at: '2026-07-30T05:00:00Z',
      }],
      error: null,
    });
    const filterUser = vi.fn(() => ({order}));
    const select = vi.fn(() => ({eq: filterUser}));
    from.mockReturnValue({select});

    await expect(getSentenceAttemptAnalytics('user-1')).resolves.toEqual({
      data: [{
        sentence_key: 'sentence-1',
        is_correct: true,
        first_attempt: true,
        response_time_ms: 1200,
        created_at: '2026-07-30T05:00:00Z',
      }],
      error: null,
    });
    expect(filterUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(order).toHaveBeenCalledWith('created_at', {ascending: false});
  });

  it('persists one complete schedule update on only the caller-owned card', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {id: 'card-1'},
      error: null,
    });
    const select = vi.fn(() => ({single}));
    const filterUser = vi.fn(() => ({select}));
    const filterId = vi.fn(() => ({eq: filterUser}));
    const update = vi.fn(() => ({eq: filterId}));
    from.mockReturnValue({update});

    await expect(
      updateLearningCardSchedule('user-1', 'card-1', cardSchedule),
    ).resolves.toEqual({data: null, error: null});

    expect(update).toHaveBeenCalledWith(cardSchedule);
    expect(filterId).toHaveBeenCalledWith('id', 'card-1');
    expect(filterUser).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('completes only the caller-owned active session with an end time', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {id: 'session-1'},
      error: null,
    });
    const select = vi.fn(() => ({single}));
    const filterStatus = vi.fn(() => ({select}));
    const filterUser = vi.fn(() => ({eq: filterStatus}));
    const filterId = vi.fn(() => ({eq: filterUser}));
    const update = vi.fn(() => ({eq: filterId}));
    from.mockReturnValue({update});

    await expect(
      completeStudySession(
        'user-1',
        'session-1',
        '2026-07-30T05:00:30.000Z',
      ),
    ).resolves.toEqual({data: null, error: null});

    expect(update).toHaveBeenCalledWith({
      status: 'completed',
      ended_at: '2026-07-30T05:00:30.000Z',
    });
    expect(filterId).toHaveBeenCalledWith('id', 'session-1');
    expect(filterUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(filterStatus).toHaveBeenCalledWith('status', 'active');
  });

  it('marks only the caller-owned active session as paused', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {id: 'session-1'},
      error: null,
    });
    const select = vi.fn(() => ({single}));
    const filterStatus = vi.fn(() => ({select}));
    const filterUser = vi.fn(() => ({eq: filterStatus}));
    const filterId = vi.fn(() => ({eq: filterUser}));
    const update = vi.fn(() => ({eq: filterId}));
    from.mockReturnValue({update});

    await expect(
      pauseStudySession('user-1', 'session-1'),
    ).resolves.toEqual({data: null, error: null});

    expect(update).toHaveBeenCalledWith({status: 'paused'});
    expect(filterId).toHaveBeenCalledWith('id', 'session-1');
    expect(filterUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(filterStatus).toHaveBeenCalledWith('status', 'active');
  });

  it('returns a recoverable error when an attempt write fails', async () => {
    from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({
        error: {message: 'network unavailable'},
      }),
    });

    const result = await recordStudyAttempt(
      'user-1',
      'session-1',
      attemptInput,
    );

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Không thể/);
  });

  it('converts a thrown session transport failure into a recoverable result', async () => {
    from.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockRejectedValue(new Error('offline')),
        })),
      })),
    });

    const result = await createStudySession('user-1', sessionInput);

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Không thể/);
  });
});
