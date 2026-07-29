import {createContext, ReactNode, useContext, useEffect, useMemo, useState} from 'react';
import {User} from '@supabase/supabase-js';
import {getSupabaseClient, getSupabaseConfigurationError} from '../../lib/supabase';

type AuthStatus = 'config-error' | 'loading' | 'anonymous' | 'authenticated';
type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  roles: string[];
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
  const client = getSupabaseClient();
  const configurationError = getSupabaseConfigurationError();
  const [status, setStatus] = useState<AuthStatus>(configurationError ? 'config-error' : 'loading');
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    const load = async (nextUser: User | null) => {
      if (!alive) return;
      setUser(nextUser);
      if (!nextUser) { setRoles([]); setStatus('anonymous'); return; }
      const {data, error: roleError} = await client.from('user_roles').select('role').eq('user_id', nextUser.id);
      if (!alive) return;
      if (roleError) { setError('Không thể tải quyền tài khoản.'); setRoles([]); }
      else setRoles((data ?? []).map((row) => row.role));
      setStatus('authenticated');
    };
    client.auth.getUser().then(({data}) => load(data.user));
    const {data: subscription} = client.auth.onAuthStateChange((_event, session) => { void load(session?.user ?? null); });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [client]);

  const value = useMemo<AuthContextValue>(() => ({
    status, user, roles, error,
    signInWithGoogle: async () => {
      if (!client) return;
      setError(null);
      const {error: signInError} = await client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: window.location.origin}});
      if (signInError) setError('Không thể bắt đầu đăng nhập Google.');
    },
    signOut: async () => { if (client) await client.auth.signOut(); },
  }), [client, error, roles, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
