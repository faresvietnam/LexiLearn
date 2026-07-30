import {getSupabaseClient} from '../../lib/supabase';
import {StudyAttemptInput, StudySessionInput} from '../../types';
import {PersistenceResult} from './settingsRepository';

const CREATE_ERROR =
  'Không thể lưu phiên học. Tiến trình cục bộ vẫn được giữ.';
const ATTEMPT_ERROR =
  'Không thể lưu lần trả lời. Tiến trình cục bộ vẫn được giữ.';
const UPDATE_ERROR =
  'Không thể cập nhật trạng thái phiên học. Vui lòng thử lại.';

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
    });

    return error
      ? {data: null, error: ATTEMPT_ERROR}
      : {data: null, error: null};
  } catch {
    return {data: null, error: ATTEMPT_ERROR};
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
