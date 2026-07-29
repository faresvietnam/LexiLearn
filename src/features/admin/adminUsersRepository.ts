import {getSupabaseClient} from '../../lib/supabase';

export type AdminUser = {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  joinedAt: string;
};

type AdminUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  user_roles: {role: string}[] | null;
};

const LOAD_ERROR = 'Không thể tải danh sách người dùng.';

export async function loadAdminUsers(): Promise<
  {data: AdminUser[]; error: null} | {data: null; error: string}
> {
  const client = getSupabaseClient();

  if (!client) {
    return {data: null, error: LOAD_ERROR};
  }

  const {data, error} = (await client
    .from('users')
    .select('id, email, display_name, created_at, user_roles(role)')
    .order('created_at', {ascending: false})) as unknown as {
    data: AdminUserRow[] | null;
    error: unknown | null;
  };

  if (error || !data) {
    return {data: null, error: LOAD_ERROR};
  }

  return {
    data: data.map((user) => ({
      id: user.id,
      displayName: user.display_name ?? user.email,
      email: user.email,
      roles: (user.user_roles ?? []).map(({role}) => role),
      joinedAt: user.created_at,
    })),
    error: null,
  };
}
