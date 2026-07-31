import {describe, expect, it, vi} from 'vitest';

const {getSupabaseClient, rpc} = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSupabaseClient: vi.fn(() => ({rpc: vi.fn()})),
}));

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {moderatePrivateWord} from './moderationRepository';

describe('moderationRepository', () => {
  it('calls the transactional moderation RPC with the optimistic version', async () => {
    rpc.mockResolvedValue({data: {id: 'word-1', status: 'approved'}, error: null});
    getSupabaseClient.mockReturnValue({rpc});

    await expect(moderatePrivateWord('word-1', 'approve', 1, null, null)).resolves.toEqual({
      data: {id: 'word-1', status: 'approved'},
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('moderate_private_word', {
      p_private_word_id: 'word-1',
      p_action: 'approve',
      p_submission_version: 1,
      p_merged_global_word_id: null,
      p_admin_comment: null,
    });
  });

  it('returns a safe error for stale moderation versions', async () => {
    rpc.mockResolvedValue({data: null, error: {message: 'stale_submission_version'}});
    getSupabaseClient.mockReturnValue({rpc});

    const result = await moderatePrivateWord('word-1', 'reject', 1, null, 'bad');
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/không thể|thay đổi/i);
  });
});
