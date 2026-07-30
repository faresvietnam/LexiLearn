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
  const selectAfterUpdate = vi.fn(() => ({single: singleAfterUpdate}));
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
