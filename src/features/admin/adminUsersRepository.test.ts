import {describe, expect, it, vi} from 'vitest';

const {getSupabaseClient, mockQuery} = vi.hoisted(() => {
  const getSupabaseClient = vi.fn();
  const query = {
    order: vi.fn(),
  };

  const mockQuery = (result: unknown) => {
    query.order.mockResolvedValue({data: result, error: null});
    getSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => query),
      })),
    });
  };

  return {getSupabaseClient, mockQuery};
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
        user_roles: [{role: 'learner'}],
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
        },
      ],
      error: null,
    });
  });
});
