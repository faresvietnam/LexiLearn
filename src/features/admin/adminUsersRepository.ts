import {getSupabaseClient} from '../../lib/supabase';

export type AdminUser = {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  joinedAt: string;
  vocabularyCount: number;
  rememberedWordCount: number;
  averageNewWordsPerStudyDay: number;
};

type AdminUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  roles: string[] | null;
  vocabulary_count: number;
  remembered_word_count: number;
  average_new_words_per_study_day: number;
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
    .rpc('admin_user_stats')) as unknown as {
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
      roles: user.roles ?? [],
      joinedAt: user.created_at,
      vocabularyCount: Number(user.vocabulary_count ?? 0),
      rememberedWordCount: Number(user.remembered_word_count ?? 0),
      averageNewWordsPerStudyDay: Number(user.average_new_words_per_study_day ?? 0),
    })),
    error: null,
  };
}
