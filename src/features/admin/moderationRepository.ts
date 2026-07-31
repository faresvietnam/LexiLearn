import {getSupabaseClient} from '../../lib/supabase';
import type {PersistenceResult} from '../persistence/settingsRepository';

const MODERATION_ERROR = 'Không thể cập nhật duyệt bài. Vui lòng tải lại và thử lại.';

export async function moderatePrivateWord(
  privateWordId: string,
  action: 'approve' | 'reject' | 'merge',
  submissionVersion: number,
  mergedGlobalWordId: string | null,
  adminComment: string | null,
): Promise<PersistenceResult<{id: string; status: string}>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: MODERATION_ERROR};

  try {
    const {data, error} = await client.rpc('moderate_private_word', {
      p_private_word_id: privateWordId,
      p_action: action,
      p_submission_version: submissionVersion,
      p_merged_global_word_id: mergedGlobalWordId,
      p_admin_comment: adminComment,
    });
    return error || !data
      ? {data: null, error: error?.message?.includes('stale') ? 'Dữ liệu đã thay đổi, vui lòng tải lại.' : MODERATION_ERROR}
      : {data: data as {id: string; status: string}, error: null};
  } catch {
    return {data: null, error: MODERATION_ERROR};
  }
}
