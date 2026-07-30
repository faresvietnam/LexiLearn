import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {User} from '@supabase/supabase-js';

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  queryRoles: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  client: null as unknown,
  authStateCallback: null as
    | ((_event: string, session: {user: User} | null) => void)
    | null,
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => authMocks.client,
  getSupabaseConfigurationError: () => null,
}));

import {AuthProvider, useAuth} from './AuthProvider';

type RoleResult = {
  data: Array<{role: string}> | null;
  error: {message: string} | null;
};

function createClient() {
  return {
    auth: {
      getUser: authMocks.getUser,
      onAuthStateChange: authMocks.onAuthStateChange,
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) =>
          authMocks.queryRoles(userId),
      }),
    }),
  };
}

function deferredRoleResult() {
  let resolve!: (result: RoleResult) => void;
  const promise = new Promise<RoleResult>((next) => {
    resolve = next;
  });
  return {promise, resolve};
}

function user(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-30T00:00:00.000Z',
  };
}

function AuthStateProbe() {
  const {error, roles, status, user: currentUser} = useAuth();
  return (
    <>
      <output data-testid="auth-state">
        {JSON.stringify({status, userId: currentUser?.id ?? null, roles})}
      </output>
      <output data-testid="auth-error">{error}</output>
    </>
  );
}

beforeEach(() => {
  authMocks.client = createClient();
  authMocks.getUser.mockReset();
  authMocks.queryRoles.mockReset();
  authMocks.onAuthStateChange.mockReset();
  authMocks.unsubscribe.mockReset();
  authMocks.authStateCallback = null;
  authMocks.onAuthStateChange.mockImplementation((callback) => {
    authMocks.authStateCallback = callback;
    return {data: {subscription: {unsubscribe: authMocks.unsubscribe}}};
  });
});

afterEach(cleanup);

describe('AuthProvider role request ordering', () => {
  it('does not let an older role load restore authentication after sign-out', async () => {
    const pendingRoles = deferredRoleResult();
    authMocks.getUser.mockResolvedValue({data: {user: user('user-a')}});
    authMocks.queryRoles.mockReturnValue(pendingRoles.promise);

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authMocks.queryRoles).toHaveBeenCalledWith('user-a');
    });

    act(() => {
      authMocks.authStateCallback?.('SIGNED_OUT', null);
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      '{"status":"anonymous","userId":null,"roles":[]}',
    );

    await act(async () => {
      pendingRoles.resolve({data: [{role: 'admin'}], error: null});
      await pendingRoles.promise;
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      '{"status":"anonymous","userId":null,"roles":[]}',
    );
  });

  it('does not let an older user role load overwrite a newer user event', async () => {
    const userARoles = deferredRoleResult();
    const userBRoles = deferredRoleResult();
    authMocks.getUser.mockResolvedValue({data: {user: user('user-a')}});
    authMocks.queryRoles.mockImplementation((userId: string) =>
      userId === 'user-a' ? userARoles.promise : userBRoles.promise,
    );

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authMocks.queryRoles).toHaveBeenCalledWith('user-a');
    });

    act(() => {
      authMocks.authStateCallback?.('SIGNED_IN', {user: user('user-b')});
    });

    await act(async () => {
      userBRoles.resolve({data: [{role: 'learner'}], error: null});
      await userBRoles.promise;
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      '{"status":"authenticated","userId":"user-b","roles":["learner"]}',
    );

    await act(async () => {
      userARoles.resolve({
        data: [{role: 'learner'}, {role: 'admin'}],
        error: null,
      });
      await userARoles.promise;
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      '{"status":"authenticated","userId":"user-b","roles":["learner"]}',
    );
  });

  it('keeps authenticated state while refreshing roles for the same identity', async () => {
    const refreshedRoles = deferredRoleResult();
    authMocks.getUser.mockResolvedValue({data: {user: user('user-a')}});
    authMocks.queryRoles
      .mockResolvedValueOnce({
        data: [{role: 'learner'}, {role: 'admin'}],
        error: null,
      })
      .mockReturnValueOnce(refreshedRoles.promise);

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent(
        '{"status":"authenticated","userId":"user-a","roles":["learner","admin"]}',
      );
    });

    act(() => {
      authMocks.authStateCallback?.('TOKEN_REFRESHED', {user: user('user-a')});
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      '{"status":"authenticated","userId":"user-a","roles":[]}',
    );

    await act(async () => {
      refreshedRoles.resolve({
        data: [{role: 'learner'}, {role: 'admin'}],
        error: null,
      });
      await refreshedRoles.promise;
    });
  });

  it('fails closed with a retryable error when role loading fails', async () => {
    authMocks.getUser.mockResolvedValue({data: {user: user('user-a')}});
    authMocks.queryRoles.mockResolvedValue({
      data: null,
      error: {message: 'network unavailable'},
    });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent(
        '{"status":"anonymous","userId":null,"roles":[]}',
      );
    });
    expect(screen.getByTestId('auth-error')).toHaveTextContent(
      'Không thể tải quyền tài khoản. Vui lòng thử lại.',
    );
  });
});
