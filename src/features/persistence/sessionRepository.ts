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
  'Không thể cập nhật quota từ mới hôm nay.';

const LEARNING_CARD_SCHEDULE_COLUMNS =
  'id, next_review_at, last_reviewed_at, fsrs_state_version, fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps, fsrs_lapses, fsrs_retrievability, recognition_score, recall_score, spelling_score, context_score, word_structure_score, response_time_sample_count, response_time_average_ms';

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
    });

    return error
      ? {data: null, error: ATTEMPT_ERROR}
      : {data: null, error: null};
  } catch {
    return {data: null, error: ATTEMPT_ERROR};
  }
}

export async function getSentenceAttemptAnalytics(
  userId: string,
): Promise<PersistenceResult<StudyAttemptAnalyticsRow[]>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: ANALYTICS_READ_ERROR};

  try {
    const {data, error} = await client
      .from('study_attempts')
      .select('sentence_key, is_correct, first_attempt, response_time_ms, created_at')
      .eq('user_id', userId)
      .not('sentence_key', 'is', null)
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
      .select('reserved_count')
      .eq('user_id', userId)
      .eq('study_date', studyDate)
      .maybeSingle();
    return error
      ? {data: null, error: NEW_WORD_QUOTA_ERROR}
      : {data: data?.reserved_count ?? 0, error: null};
  } catch {
    return {data: null, error: NEW_WORD_QUOTA_ERROR};
  }
}

export async function reserveDailyNewWordQuota(
  userId: string,
  studyDate: string,
  dailyLimit: number,
  requestedCount: number,
): Promise<PersistenceResult<number>> {
  const client = getSupabaseClient();
  if (!client) return {data: requestedCount, error: null};
  try {
    const {data, error} = await client.rpc('reserve_new_word_quota', {
      requested_user_id: userId,
      requested_study_date: studyDate,
      daily_limit: dailyLimit,
      requested_count: requestedCount,
    });
    return error || data !== requestedCount
      ? {data: null, error: NEW_WORD_QUOTA_ERROR}
      : {data, error: null};
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
