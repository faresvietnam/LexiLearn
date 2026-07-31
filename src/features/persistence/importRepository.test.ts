import {beforeEach, describe, expect, it, vi} from 'vitest';

const {from, getSupabaseClient, insert, select, single, update, eq} = vi.hoisted(() => {
  const single = vi.fn();
  const chain = {eq: vi.fn(), select: vi.fn(), single};
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  const eq = chain.eq;
  const select = chain.select;
  const insert = vi.fn()
    .mockImplementationOnce(() => ({select}))
    .mockImplementationOnce(() => ({
      select: vi.fn().mockResolvedValue({data: [{id: 'row-1'}], error: null}),
    }));
  const update = vi.fn(() => chain);
  const from = vi.fn(() => ({insert, update}));
  const getSupabaseClient = vi.fn(() => ({from}));
  return {from, getSupabaseClient, insert, select, single, update, eq};
});

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {
  createCsvImportBatch,
  createEditSuggestion,
  listResumableCsvImports,
  markCsvImportRow,
} from './importRepository';

describe('CSV import persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockImplementation(() => ({select}));
    getSupabaseClient.mockReturnValue({from});
  });

  it('creates an owned import batch and its pending rows', async () => {
    single.mockResolvedValueOnce({data: {id: 'import-1'}, error: null});

    await expect(createCsvImportBatch('user-1', 'words.csv', [
      {sourceRowNumber: 2, canonicalKey: 'transportation|noun', rawData: {word: 'transportation', vietnameseMeaning: 'vận chuyển'}},
    ])).resolves.toEqual({data: {importId: 'import-1', rowIds: ['row-1']}, error: null});

    expect(from).toHaveBeenNthCalledWith(1, 'csv_imports');
    expect(insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      owner_user_id: 'user-1',
      source_filename: 'words.csv',
      status: 'uploaded',
      total_rows: 1,
    }));
    expect(from).toHaveBeenNthCalledWith(2, 'csv_import_rows');
    expect(insert).toHaveBeenNthCalledWith(2, [{
      import_id: 'import-1',
      owner_user_id: 'user-1',
      source_row_number: 2,
      canonical_key: 'transportation|noun',
      raw_data: {word: 'transportation', vietnameseMeaning: 'vận chuyển'},
      status: 'pending',
    }]);
  });

  it('marks a row with an outcome while keeping ownership scoped', async () => {
    single.mockResolvedValue({data: {id: 'row-1'}, error: null});

    await expect(markCsvImportRow('user-1', 'import-1', 'row-1', 'imported', null))
      .resolves.toEqual({data: true, error: null});

    expect(from).toHaveBeenCalledWith('csv_import_rows');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'imported',
      error_details: null,
    }));
    expect(eq).toHaveBeenCalledWith('id', 'row-1');
  });

  it('creates an owner-scoped Edit Suggestion without changing Global content', async () => {
    single.mockResolvedValue({data: {id: 'suggestion-1'}, error: null});

    await expect(createEditSuggestion('user-1', 'global-1', {
      vietnameseMeaning: 'sức khỏe',
    })).resolves.toEqual({data: {id: 'suggestion-1'}, error: null});

    expect(from).toHaveBeenCalledWith('edit_suggestions');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      global_word_id: 'global-1',
      suggested_changes: {vietnameseMeaning: 'sức khỏe'},
      status: 'pending',
    });
  });

  it('reads only the owner\'s unfinished imports and pending rows', async () => {
    const order = vi.fn(() => Promise.resolve({
      data: [{
        id: 'row-1', import_id: 'import-1', source_row_number: 2,
        canonical_key: 'new|noun', raw_data: {word: 'new'}, status: 'pending',
      }],
      error: null,
    }));
    const resumableChain = {
      eq: vi.fn(),
      in: vi.fn(),
      order,
    };
    resumableChain.eq.mockReturnValue(resumableChain);
    resumableChain.in.mockReturnValue(resumableChain);
    from.mockReturnValueOnce({select: vi.fn(() => resumableChain)} as never);

    await expect(listResumableCsvImports('user-1')).resolves.toEqual({
      data: [{
        id: 'row-1', import_id: 'import-1', source_row_number: 2,
        canonical_key: 'new|noun', raw_data: {word: 'new'}, status: 'pending',
      }],
      error: null,
    });
    expect(resumableChain.eq).toHaveBeenCalledWith('owner_user_id', 'user-1');
  });
});
