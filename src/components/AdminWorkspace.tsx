import React, {useEffect, useState} from 'react';
import {
  loadAdminUsers,
  type AdminUser,
} from '../features/admin/adminUsersRepository';

type AdminWorkspaceProps = {
  loadUsers?: typeof loadAdminUsers;
};

type UserDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error';

const formatJoinedAt = (joinedAt: string) =>
  new Intl.DateTimeFormat('vi-VN').format(new Date(joinedAt));
const formatAverage = (value: number) => `${value.toLocaleString('vi-VN', {maximumFractionDigits: 1})}/ngày`;

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  loadUsers = loadAdminUsers,
}) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState<UserDirectoryStatus>('idle');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void loadUsers()
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setStatus('error');
          return;
        }
        setUsers(result.data);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="text-slate-500 text-sm mt-1">
          Quản lý tài khoản người dùng LexiLearn.
        </p>
      </div>

      {status === 'loading' && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
          Đang tải danh sách người dùng...
        </div>
      )}

      {status === 'error' && (
        <div className="p-12 text-center bg-white rounded-2xl border border-rose-200 text-rose-700 text-sm">
          Không thể tải danh sách người dùng.
        </div>
      )}

      {status === 'ready' && users.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
          Chưa có người dùng nào.
        </div>
      )}

      {status === 'ready' && users.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full min-w-2xl text-sm text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-bold" scope="col">Tên</th>
                <th className="px-5 py-3 font-bold" scope="col">Email</th>
                <th className="px-5 py-3 font-bold" scope="col">Từ trong thư viện</th>
                <th className="px-5 py-3 font-bold" scope="col">Từ đã nhớ</th>
                <th className="px-5 py-3 font-bold" scope="col">TB từ mới/ngày học</th>
                <th className="px-5 py-3 font-bold" scope="col">Vai trò</th>
                <th className="px-5 py-3 font-bold" scope="col">Tham gia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="text-slate-700">
                  <td className="px-5 py-4 font-semibold text-slate-900">{user.displayName}</td>
                  <td className="px-5 py-4">{user.email}</td>
                  <td className="px-5 py-4 text-center">{user.vocabularyCount}</td>
                  <td className="px-5 py-4 text-center">{user.rememberedWordCount}</td>
                  <td className="px-5 py-4">{formatAverage(user.averageNewWordsPerStudyDay)}</td>
                  <td className="px-5 py-4">{user.roles.join(', ')}</td>
                  <td className="px-5 py-4">{formatJoinedAt(user.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
