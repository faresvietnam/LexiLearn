import {beforeEach, describe, expect, it, vi} from 'vitest';

const {
  eq,
  from,
  getSupabaseClient,
  selectAfterUpdate,
  selectFromTable,
  singleAfterSelect,
  singleAfterUpdate,
  update,
} = vi.hoisted(() => {
  const singleAfterSelect = vi.fn();
  const singleAfterUpdate = vi.fn();
  const eq = vi.fn(() => ({single: singleAfterSelect}));
  const selectFromTable = vi.fn(() => ({eq}));
  const selectAfterUpdate = vi.fn((_fields: string) => ({
    single: singleAfterUpdate,
  }));
  const updateEq = vi.fn(() => ({select: selectAfterUpdate}));
  const update = vi.fn(() => ({eq: updateEq}));
  const from = vi.fn(() => ({
    select: selectFromTable,
    update,
  }));
  const getSupabaseClient = vi.fn(() => ({from}));

  return {
    eq,
    from,
    getSupabaseClient,
    selectAfterUpdate,
    selectFromTable,
    singleAfterSelect,
    singleAfterUpdate,
    update,
  };
});

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {
  loadGeminiApiKey,
  saveAiProviderSettings,
  saveGeminiApiKey,
} from './settingsRepository';

describe('personal Gemini key persistence', () => {
  beforeEach(() => {
    from.mockClear();
    selectFromTable.mockClear();
    eq.mockClear();
    update.mockClear();
    selectAfterUpdate.mockClear();
    singleAfterSelect.mockReset();
    singleAfterUpdate.mockReset();
    getSupabaseClient.mockReturnValue({from});
  });

  it('reads only the authenticated owner row requested by the caller', async () => {
    singleAfterSelect.mockResolvedValue({
      data: {gemini_api_key: 'owner-key'},
      error: null,
    });

    await expect(loadGeminiApiKey('owner-user')).resolves.toEqual({
      data: 'owner-key',
      error: null,
    });
    expect(from).toHaveBeenCalledWith('user_settings');
    expect(selectFromTable).toHaveBeenCalledWith('gemini_api_key');
    expect(eq).toHaveBeenCalledWith('user_id', 'owner-user');
  });

  it('trims and saves a personal key on only the owner row', async () => {
    singleAfterUpdate.mockResolvedValue({
      data: {gemini_api_key: 'owner-key'},
      error: null,
    });

    await expect(saveGeminiApiKey(
      'owner-user',
      '  owner-key  ',
    )).resolves.toEqual({
      data: 'owner-key',
      error: null,
    });
    expect(update).toHaveBeenCalledWith({gemini_api_key: 'owner-key'});
    expect(
      update.mock.results[0].value.eq,
    ).toHaveBeenCalledWith('user_id', 'owner-user');
    expect(selectAfterUpdate).toHaveBeenCalledWith('gemini_api_key');
  });

  it('removes the saved key without changing other settings', async () => {
    singleAfterUpdate.mockResolvedValue({
      data: {gemini_api_key: null},
      error: null,
    });

    await expect(saveGeminiApiKey('owner-user', null)).resolves.toEqual({
      data: null,
      error: null,
    });
    expect(update).toHaveBeenCalledWith({gemini_api_key: null});
  });

  it('returns a generic error that never contains the submitted key', async () => {
    singleAfterUpdate.mockResolvedValue({
      data: null,
      error: {message: 'database rejected owner-key'},
    });

    const result = await saveGeminiApiKey('owner-user', 'owner-key');

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Không thể/);
    expect(result.error).not.toContain('owner-key');
  });
});

describe('AI provider settings persistence', () => {
  beforeEach(() => {
    from.mockClear();
    update.mockClear();
    selectAfterUpdate.mockClear();
    singleAfterUpdate.mockReset();
    getSupabaseClient.mockReturnValue({from});
  });

  it('normalizes and saves the complete provider configuration atomically', async () => {
    singleAfterUpdate.mockResolvedValue({
      data: {
        ai_provider: 'openai-compatible',
        gemini_api_key: 'gemini-key',
        openai_compatible_base_url: 'https://integrate.8686.vn/v1',
        openai_compatible_token_configured: true,
        openai_compatible_model: 'deepseek-ai/deepseek-v4-flash',
      },
      error: null,
    });

    await expect(saveAiProviderSettings('owner-user', {
      aiProvider: 'openai-compatible',
      geminiApiKey: ' gemini-key ',
      openAICompatibleBaseUrl: ' https://integrate.8686.vn/v1/// ',
      openAICompatibleTokenConfigured: false,
      openAICompatibleToken: ' compat-token ',
      openAICompatibleModel: ' deepseek-ai/deepseek-v4-flash ',
    })).resolves.toEqual({
      data: {
        aiProvider: 'openai-compatible',
        geminiApiKey: 'gemini-key',
        openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
        openAICompatibleTokenConfigured: true,
        openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
      },
      error: null,
    });

    expect(update).toHaveBeenCalledWith({
      ai_provider: 'openai-compatible',
      gemini_api_key: 'gemini-key',
      openai_compatible_base_url: 'https://integrate.8686.vn/v1',
      openai_compatible_token: 'compat-token',
      openai_compatible_model: 'deepseek-ai/deepseek-v4-flash',
    });
    expect(update.mock.results[0].value.eq)
      .toHaveBeenCalledWith('user_id', 'owner-user');
    expect(selectAfterUpdate.mock.calls[0][0])
      .not.toMatch(/openai_compatible_token(?:,|\s*$)/m);
  });

  it('preserves a stored token when the token field is omitted', async () => {
    singleAfterUpdate.mockResolvedValue({
      data: {
        ai_provider: 'openai-compatible',
        gemini_api_key: null,
        openai_compatible_base_url: 'https://api.openai.com/v1',
        openai_compatible_token_configured: true,
        openai_compatible_model: 'gpt-5.5',
      },
      error: null,
    });

    await saveAiProviderSettings('owner-user', {
      aiProvider: 'openai-compatible',
      geminiApiKey: null,
      openAICompatibleBaseUrl: 'https://api.openai.com/v1',
      openAICompatibleTokenConfigured: true,
      openAICompatibleModel: 'gpt-5.5',
    });

    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({
      openai_compatible_token: expect.anything(),
    }));
  });

  it('clears the compatible token without leaking it in persistence errors', async () => {
    singleAfterUpdate.mockResolvedValue({
      data: null,
      error: {message: 'database rejected compat-secret'},
    });

    const result = await saveAiProviderSettings('owner-user', {
      aiProvider: 'openai-compatible',
      geminiApiKey: null,
      openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
      openAICompatibleTokenConfigured: true,
      openAICompatibleToken: null,
      openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Không thể/);
    expect(result.error).not.toContain('compat-secret');
  });
});
