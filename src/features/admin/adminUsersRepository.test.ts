import {describe, expect, it, vi} from 'vitest';

const {getSupabaseClient, mockQuery, rpc} = vi.hoisted(() => {
  const getSupabaseClient = vi.fn();
  const rpc = vi.fn();

  const mockQuery = (result: unknown) => {
    rpc.mockClear();
    rpc.mockResolvedValue({data: result, error: null});
    getSupabaseClient.mockReturnValue({
      rpc,
    });
  };

  return {getSupabaseClient, mockQuery, rpc};
});

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {loadAdminUsers} from './adminUsersRepository';

describe('loadAdminUsers', () => {
  it('maps user rows into the admin directory format', async () => {
    mockQuery([
      {
        id: 'u1',
        email: 'a@example.com',
        display_name: null,
        created_at: '2026-07-30T00:00:00Z',
        roles: ['learner'],
        vocabulary_count: 12,
        remembered_word_count: 5,
        average_new_words_per_study_day: 3.5,
      },
    ]);

    await expect(loadAdminUsers()).resolves.toEqual({
      data: [
        {
          id: 'u1',
          displayName: 'a@example.com',
          email: 'a@example.com',
          roles: ['learner'],
          joinedAt: '2026-07-30T00:00:00Z',
          vocabularyCount: 12,
          rememberedWordCount: 5,
          averageNewWordsPerStudyDay: 3.5,
        },
      ],
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('admin_user_stats');
  });
});
