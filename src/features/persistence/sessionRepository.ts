import {getSupabaseClient} from '../../lib/supabase';
import {StudyAttemptInput, StudySessionInput} from '../../types';
import type {
  LearningCardFsrsRow,
  LearningCardScheduleUpdate,
} from '../scheduling/fsrsScheduler';
import {PersistenceResult} from './settingsRepository';
import type {StudyAttemptAnalyticsRow} from '../analytics/sentenceAnalytics';

const CREATE_ERROR =
  'Không thể lưu phiên học. Tiến trình cục bộ vẫn được giữ.';
const ATTEMPT_ERROR =
  'Không thể lưu lần trả lời. Tiến trình cục bộ vẫn được giữ.';
const UPDATE_ERROR =
  'Không thể cập nhật trạng thái phiên học. Vui lòng thử lại.';
const CARD_READ_ERROR =
  'Không thể tải trạng thái ôn tập. Tiến trình cục bộ vẫn được giữ.';
const CARD_UPDATE_ERROR =
  'Không thể lưu lịch ôn tập. Tiến trình cục bộ vẫn được giữ.';
const ANALYTICS_READ_ERROR =
  'Không thể tải thống kê câu. Tiến trình học vẫn được giữ.';
const NEW_WORD_QUOTA_ERROR =
  'Không thể tải quota từ mới. Tiến trình học vẫn được giữ.';
const LEARNING_CARD_SCHEDULE_COLUMNS =
  'id, next_review_at, last_reviewed_at, fsrs_state_version, fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps, fsrs_lapses, fsrs_retrievability, recognition_score, recall_score, spelling_score, context_score, word_structure_score, response_time_sample_count, response_time_average_ms';

const STUDY_ATTEMPT_ANALYTICS_COLUMNS =
  'learning_card_id, sentence_key, is_correct, first_attempt, response_time_ms, hint_level, answer_revealed, question_type, created_at';

function serializeStudyAttempt(input: StudyAttemptInput) {
  return {
    learning_card_id: input.learningCardId,
    question_type: input.questionType,
    input_mode: input.inputMode,
    attempt_number: input.attemptNumber,
    submitted_answer: input.submittedAnswer,
    is_correct: input.isCorrect,
    first_attempt: input.firstAttempt,
    response_time_ms: input.responseTimeMs,
    hint_level: input.hintLevel,
    answer_revealed: input.answerRevealed,
    error_types: input.errorTypes,
    sentence_key: input.sentenceKey ?? null,
  };
}

export async function createStudySession(
  userId: string,
  input: StudySessionInput,
): Promise<PersistenceResult<string>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: CREATE_ERROR};

  try {
    const {data, error} = await client
      .from('study_sessions')
      .insert({
        user_id: userId,
        scope_snapshot: input.scopeSnapshot,
        review_limit: input.reviewLimit,
        new_word_limit: input.newWordLimit,
        status: 'active',
      })
      .select('id')
      .single();

    return error || !data
      ? {data: null, error: CREATE_ERROR}
      : {data: data.id, error: null};
  } catch {
    return {data: null, error: CREATE_ERROR};
  }
}

export async function recordStudyAttempt(
  userId: string,
  sessionId: string,
  input: StudyAttemptInput,
): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: ATTEMPT_ERROR};

  try {
    const {error} = await client.from('study_attempts').insert({
      user_id: userId,
      session_id: sessionId,
      ...serializeStudyAttempt(input),
    });

    return error
      ? {data: null, error: ATTEMPT_ERROR}
      : {data: null, error: null};
  } catch {
    return {data: null, error: ATTEMPT_ERROR};
  }
}

export async function submitLearningReview(input: {
  userId: string;
  sessionId: string;
  learningCardId: string;
  idempotencyKey: string;
  isNewWord: boolean;
  studyDate: string;
  dailyLimit: number;
  attempts: StudyAttemptInput[];
  schedule: LearningCardScheduleUpdate;
}): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: ATTEMPT_ERROR};

  try {
    const {error} = await client.rpc('submit_learning_review', {
      p_session_id: input.sessionId,
      p_learning_card_id: input.learningCardId,
      p_idempotency_key: input.idempotencyKey,
      p_is_new_word: input.isNewWord,
      p_study_date: input.studyDate,
      p_daily_limit: input.dailyLimit,
      p_attempts: input.attempts.map(serializeStudyAttempt),
      p_schedule: input.schedule,
    });
    return error ? {data: null, error: ATTEMPT_ERROR} : {data: null, error: null};
  } catch {
    return {data: null, error: ATTEMPT_ERROR};
  }
}

export async function getSentenceAttemptAnalytics(
  userId: string,
): Promise<PersistenceResult<StudyAttemptAnalyticsRow[]>> {
  const result = await getStudyAttemptAnalytics(userId);
  return result.error
    ? result
    : {data: (result.data ?? []).filter((row) => row.sentence_key !== null), error: null};
}

export async function getStudyAttemptAnalytics(
  userId: string,
): Promise<PersistenceResult<StudyAttemptAnalyticsRow[]>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: ANALYTICS_READ_ERROR};

  try {
    const {data, error} = await client
      .from('study_attempts')
      .select(STUDY_ATTEMPT_ANALYTICS_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', {ascending: false});
    return error
      ? {data: null, error: ANALYTICS_READ_ERROR}
      : {data: (data ?? []) as StudyAttemptAnalyticsRow[], error: null};
  } catch {
    return {data: null, error: ANALYTICS_READ_ERROR};
  }
}

export async function getDailyNewWordUsage(
  userId: string,
  studyDate: string,
): Promise<PersistenceResult<number>> {
  const client = getSupabaseClient();
  if (!client) return {data: 0, error: null};
  try {
    const {data, error} = await client
      .from('daily_new_word_usage')
      .select('completed_count')
      .eq('user_id', userId)
      .eq('study_date', studyDate)
      .maybeSingle();
    return error
      ? {data: null, error: NEW_WORD_QUOTA_ERROR}
      : {data: data?.completed_count ?? 0, error: null};
  } catch {
    return {data: null, error: NEW_WORD_QUOTA_ERROR};
  }
}

export async function getLearningCardSchedule(
  userId: string,
  cardId: string,
): Promise<PersistenceResult<LearningCardFsrsRow>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: CARD_READ_ERROR};

  try {
    const {data, error} = await client
      .from('learning_cards')
      .select(LEARNING_CARD_SCHEDULE_COLUMNS)
      .eq('id', cardId)
      .eq('user_id', userId)
      .single();

    return error || !data
      ? {data: null, error: CARD_READ_ERROR}
      : {data: data as LearningCardFsrsRow, error: null};
  } catch {
    return {data: null, error: CARD_READ_ERROR};
  }
}

export async function updateLearningCardSchedule(
  userId: string,
  cardId: string,
  schedule: LearningCardScheduleUpdate,
): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: CARD_UPDATE_ERROR};

  try {
    const {data, error} = await client
      .from('learning_cards')
      .update(schedule)
      .eq('id', cardId)
      .eq('user_id', userId)
      .select('id')
      .single();

    return error || !data
      ? {data: null, error: CARD_UPDATE_ERROR}
      : {data: null, error: null};
  } catch {
    return {data: null, error: CARD_UPDATE_ERROR};
  }
}

async function updateActiveSession(
  userId: string,
  sessionId: string,
  values: {status: 'paused'} | {status: 'completed'; ended_at: string},
): Promise<PersistenceResult<null>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: UPDATE_ERROR};

  try {
    const {data, error} = await client
      .from('study_sessions')
      .update(values)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .select('id')
      .single();

    return error || !data
      ? {data: null, error: UPDATE_ERROR}
      : {data: null, error: null};
  } catch {
    return {data: null, error: UPDATE_ERROR};
  }
}

export function completeStudySession(
  userId: string,
  sessionId: string,
  endedAt: string,
) {
  return updateActiveSession(userId, sessionId, {
    status: 'completed',
    ended_at: endedAt,
  });
}

export function pauseStudySession(userId: string, sessionId: string) {
  return updateActiveSession(userId, sessionId, {status: 'paused'});
}
