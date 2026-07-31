import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AdminWorkspace} from './AdminWorkspace';
import type {AdminUser} from '../features/admin/adminUsersRepository';

afterEach(cleanup);

const approvalProps = {
};

describe('AdminWorkspace', () => {
  it('shows the user directory without a moderation tab', () => {
    const loadUsers = vi.fn().mockResolvedValue({data: [], error: null});

    render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);

    expect(screen.getByRole('heading', {name: 'Admin'})).toBeInTheDocument();
    expect(screen.queryByText('Duyệt bài')).not.toBeInTheDocument();
    expect(loadUsers).toHaveBeenCalledOnce();
  });

  it('loads and renders the user directory', async () => {
    let resolveUsers:
      | ((result: {data: AdminUser[]; error: null}) => void)
      | undefined;
    const loadUsers = vi.fn(
      () =>
        new Promise<{data: AdminUser[]; error: null}>((resolve) => {
          resolveUsers = resolve;
        })
    );

    render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);

    expect(screen.getByText('Đang tải danh sách người dùng...')).toBeInTheDocument();
    expect(loadUsers).toHaveBeenCalledOnce();

    await act(async () => {
      resolveUsers?.({
        data: [
          {
            id: 'u1',
            displayName: 'Thang',
            email: 'thang@example.com',
            roles: ['admin', 'learner'],
            joinedAt: '2026-07-30T00:00:00Z',
          },
        ],
        error: null,
      });
    });

    expect(await screen.findByText('thang@example.com')).toBeInTheDocument();
    expect(screen.getByText('admin, learner')).toBeInTheDocument();
    expect(screen.getByText('30/7/2026')).toBeInTheDocument();
    for (const column of ['Tên', 'Email', 'Vai trò', 'Tham gia']) {
      expect(screen.getByRole('columnheader', {name: column})).toBeInTheDocument();
    }
  });

  it('shows the empty directory state', async () => {
    const loadUsers = vi.fn().mockResolvedValue({data: [], error: null});

    render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);

    expect(await screen.findByText('Chưa có người dùng nào.')).toBeInTheDocument();
  });

  it('shows a stable error when the directory cannot be loaded', async () => {
    const loadUsers = vi.fn().mockResolvedValue({
      data: null,
      error: 'Không thể tải danh sách người dùng.',
    });

    render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);

    expect(
      await screen.findByText('Không thể tải danh sách người dùng.')
    ).toBeInTheDocument();
  });
});
