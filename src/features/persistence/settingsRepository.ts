import {getSupabaseClient} from '../../lib/supabase';
import {StudyScope, UserSettings} from '../../types';
import {mapStudyScopeRow, StudyScopeRow} from './mappers';

export type PersistenceResult<T> =
  | {data: T; error: null}
  | {data: null; error: string};

const SETTINGS_ERROR = 'Không thể lưu cài đặt. Vui lòng thử lại.';
const SCOPE_ERROR = 'Không thể lưu Study Scope. Vui lòng thử lại.';
const GEMINI_KEY_LOAD_ERROR =
  'Không thể tải Gemini API key. Vui lòng thử lại.';
const GEMINI_KEY_SAVE_ERROR =
  'Không thể lưu Gemini API key. Vui lòng thử lại.';
const AI_PROVIDER_SAVE_ERROR =
  'Không thể lưu cấu hình nhà cung cấp AI. Vui lòng thử lại.';

type GeminiKeyRow = {
  gemini_api_key: string | null;
};

export type AiProviderSettings = Pick<
  UserSettings,
  | 'aiProvider'
  | 'geminiApiKey'
  | 'openAICompatibleBaseUrl'
  | 'openAICompatibleToken'
  | 'openAICompatibleModel'
>;

type AiProviderSettingsRow = {
  ai_provider: AiProviderSettings['aiProvider'];
  gemini_api_key: string | null;
  openai_compatible_base_url: string | null;
  openai_compatible_token: string | null;
  openai_compatible_model: string | null;
};

function mapAiProviderSettingsRow(
  row: AiProviderSettingsRow,
): AiProviderSettings {
  return {
    aiProvider: row.ai_provider,
    geminiApiKey: row.gemini_api_key,
    openAICompatibleBaseUrl: row.openai_compatible_base_url ?? '',
    openAICompatibleToken: row.openai_compatible_token,
    openAICompatibleModel: row.openai_compatible_model ?? '',
  };
}

export async function saveAiProviderSettings(
  userId: string,
  settings: AiProviderSettings,
): Promise<PersistenceResult<AiProviderSettings>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: AI_PROVIDER_SAVE_ERROR};

  const normalized: AiProviderSettings = {
    aiProvider: settings.aiProvider,
    geminiApiKey: settings.geminiApiKey?.trim() || null,
    openAICompatibleBaseUrl: settings.openAICompatibleBaseUrl
      .trim()
      .replace(/\/+$/, ''),
    openAICompatibleToken: settings.openAICompatibleToken?.trim() || null,
    openAICompatibleModel: settings.openAICompatibleModel.trim(),
  };
  const {data, error} = (await client
    .from('user_settings')
    .update({
      ai_provider: normalized.aiProvider,
      gemini_api_key: normalized.geminiApiKey,
      openai_compatible_base_url:
        normalized.openAICompatibleBaseUrl || null,
      openai_compatible_token: normalized.openAICompatibleToken,
      openai_compatible_model: normalized.openAICompatibleModel || null,
    })
    .eq('user_id', userId)
    .select(
      'ai_provider, gemini_api_key, openai_compatible_base_url, '
      + 'openai_compatible_token, openai_compatible_model',
    )
    .single()) as {
      data: AiProviderSettingsRow | null;
      error: unknown | null;
    };

  return error || !data
    ? {data: null, error: AI_PROVIDER_SAVE_ERROR}
    : {data: mapAiProviderSettingsRow(data), error: null};
}

export async function loadGeminiApiKey(
  userId: string,
): Promise<PersistenceResult<string | null>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: GEMINI_KEY_LOAD_ERROR};

  const {data, error} = (await client
    .from('user_settings')
    .select('gemini_api_key')
    .eq('user_id', userId)
    .single()) as {data: GeminiKeyRow | null; error: unknown | null};

  return error || !data
    ? {data: null, error: GEMINI_KEY_LOAD_ERROR}
    : {data: data.gemini_api_key, error: null};
}

export async function saveGeminiApiKey(
  userId: string,
  apiKey: string | null,
): Promise<PersistenceResult<string | null>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: GEMINI_KEY_SAVE_ERROR};

  const normalizedKey = apiKey?.trim() || null;
  const {data, error} = (await client
    .from('user_settings')
    .update({gemini_api_key: normalizedKey})
    .eq('user_id', userId)
    .select('gemini_api_key')
    .single()) as {data: GeminiKeyRow | null; error: unknown | null};

  return error || !data
    ? {data: null, error: GEMINI_KEY_SAVE_ERROR}
    : {data: data.gemini_api_key, error: null};
}

export async function saveSettings(
  userId: string,
  settings: UserSettings,
): Promise<PersistenceResult<UserSettings>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: SETTINGS_ERROR};

  const {data, error} = await client
    .from('user_settings')
    .update({
      new_words_per_day: settings.newWordsPerDay,
      review_limit_per_day: settings.reviewLimitPerDay,
      hint_behavior: settings.hintBehavior,
      audio_autoplay: settings.audioAutoplay,
      theme: settings.theme,
      language: settings.language,
      reduced_motion: settings.reducedMotion,
      char_diff_accessibility: settings.charDiffAccessibility,
    })
    .eq('user_id', userId)
    .select('user_id')
    .single();

  return error || !data
    ? {data: null, error: SETTINGS_ERROR}
    : {data: {...settings}, error: null};
}

export async function saveStudyScope(
  userId: string,
  scope: StudyScope,
): Promise<PersistenceResult<StudyScope>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: SCOPE_ERROR};

  const {data, error} = (await client
    .from('study_scope')
    .upsert({
      user_id: userId,
      active_deck_ids: scope.activeDeckIds,
      excluded_tag_ids: scope.excludedTagIds,
      paused_word_ids: scope.pausedWordIds,
    }, {onConflict: 'user_id'})
    .select('user_id, active_deck_ids, excluded_tag_ids, paused_word_ids')
    .single()) as {data: StudyScopeRow | null; error: unknown | null};

  return error || !data
    ? {data: null, error: SCOPE_ERROR}
    : {data: mapStudyScopeRow(data), error: null};
}
