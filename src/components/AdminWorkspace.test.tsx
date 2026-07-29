import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AdminWorkspace} from './AdminWorkspace';
import type {AdminUser} from '../features/admin/adminUsersRepository';

afterEach(cleanup);

const approvalProps = {
  words: [],
  onApproveWord: vi.fn(),
  onRejectWord: vi.fn(),
  onMergeWithGlobal: vi.fn(),
};

describe('AdminWorkspace', () => {
  it('shows the existing approval portal on the default submissions tab', () => {
    const loadUsers = vi.fn();

    render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);

    expect(
      screen.getByRole('heading', {name: 'Admin Word Submission Approval Portal'})
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', {name: 'Duyệt bài'})).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(loadUsers).not.toHaveBeenCalled();
  });

  it('loads and renders the user directory only after its tab is selected', async () => {
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
    fireEvent.click(screen.getByRole('tab', {name: 'Người dùng'}));

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
    fireEvent.click(screen.getByRole('tab', {name: 'Người dùng'}));

    expect(await screen.findByText('Chưa có người dùng nào.')).toBeInTheDocument();
  });

  it('shows a stable error when the directory cannot be loaded', async () => {
    const loadUsers = vi.fn().mockResolvedValue({
      data: null,
      error: 'Không thể tải danh sách người dùng.',
    });

    render(<AdminWorkspace {...approvalProps} loadUsers={loadUsers} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Người dùng'}));

    expect(
      await screen.findByText('Không thể tải danh sách người dùng.')
    ).toBeInTheDocument();
  });
});
