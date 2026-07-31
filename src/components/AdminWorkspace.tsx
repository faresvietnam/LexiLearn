import React, {useEffect, useState} from 'react';
import {AdminApprovalView} from './AdminApprovalView';
import {
  loadAdminUsers,
  type AdminUser,
} from '../features/admin/adminUsersRepository';

type AdminWorkspaceProps = React.ComponentProps<typeof AdminApprovalView> & {
  loadUsers?: typeof loadAdminUsers;
};

type UserDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

const formatJoinedAt = (joinedAt: string) =>
  new Intl.DateTimeFormat('vi-VN').format(new Date(joinedAt));

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  loadUsers = loadAdminUsers,
  ...approvalProps
}) => {
  const [activeTab, setActiveTab] = useState<'submissions' | 'users'>(
    'submissions'
  );
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userDirectoryStatus, setUserDirectoryStatus] =
    useState<UserDirectoryStatus>('idle');

  useEffect(() => {
    // Load the directory up front when submissions exist so creator IDs can
    // be rendered as emails in the approval list. Keep the lazy behaviour for
    // an empty workspace (and for the existing users tab flow).
    if (activeTab !== 'users' && approvalProps.words.length === 0) return;

    let cancelled = false;
    setUserDirectoryStatus('loading');

    void loadUsers()
      .then((result) => {
        if (cancelled) return;

        if (result.error) {
          setUserDirectoryStatus('error');
          return;
        }

        setUsers(result.data);
        setUserDirectoryStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setUserDirectoryStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, loadUsers, approvalProps.words.length]);

  const creatorEmails = Object.fromEntries(
    users.map((user) => [user.id, user.email]),
  );

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div
          role="tablist"
          aria-label="Quản trị"
          className="flex gap-2 border-b border-slate-200"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'submissions'}
            aria-controls="admin-submissions-panel"
            id="admin-submissions-tab"
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'submissions'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Duyệt bài
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            aria-controls="admin-users-panel"
            id="admin-users-tab"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Người dùng
          </button>
        </div>
      </div>

      {activeTab === 'submissions' ? (
        <div
          role="tabpanel"
          id="admin-submissions-panel"
          aria-labelledby="admin-submissions-tab"
        >
          <AdminApprovalView {...approvalProps} creatorEmails={creatorEmails} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="admin-users-panel"
          aria-labelledby="admin-users-tab"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        >
          {userDirectoryStatus === 'loading' && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
              Đang tải danh sách người dùng...
            </div>
          )}

          {userDirectoryStatus === 'error' && (
            <div className="p-12 text-center bg-white rounded-2xl border border-rose-200 text-rose-700 text-sm">
              Không thể tải danh sách người dùng.
            </div>
          )}

          {userDirectoryStatus === 'ready' && users.length === 0 && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
              Chưa có người dùng nào.
            </div>
          )}

          {userDirectoryStatus === 'ready' && users.length > 0 && (
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full min-w-2xl text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-bold" scope="col">
                      Tên
                    </th>
                    <th className="px-5 py-3 font-bold" scope="col">
                      Email
                    </th>
                    <th className="px-5 py-3 font-bold" scope="col">
                      Vai trò
                    </th>
                    <th className="px-5 py-3 font-bold" scope="col">
                      Tham gia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="text-slate-700">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {user.displayName}
                      </td>
                      <td className="px-5 py-4">{user.email}</td>
                      <td className="px-5 py-4">{user.roles.join(', ')}</td>
                      <td className="px-5 py-4">
                        {formatJoinedAt(user.joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
