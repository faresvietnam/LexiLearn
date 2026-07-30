import {describe, expect, it, vi} from 'vitest';

const {getSupabaseClient, mockQuery, select} = vi.hoisted(() => {
  const getSupabaseClient = vi.fn();
  const query = {
    order: vi.fn(),
  };
  const select = vi.fn(() => query);

  const mockQuery = (result: unknown) => {
    select.mockClear();
    query.order.mockResolvedValue({data: result, error: null});
    getSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        select,
      })),
    });
  };

  return {getSupabaseClient, mockQuery, select};
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
    expect(select).toHaveBeenCalledWith(
      'id, email, display_name, created_at, user_roles(role)',
    );
    expect(select.mock.calls.flat().join(' ')).not.toMatch(
      /gemini|user_settings/i,
    );
  });
});
