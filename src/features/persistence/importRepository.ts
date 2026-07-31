import {getSupabaseClient} from '../../lib/supabase';
import type {CsvRowRaw} from '../../types';
import type {PersistenceResult} from './settingsRepository';

const IMPORT_ERROR = 'Không thể lưu tiến trình import CSV. Vui lòng thử lại.';

export type CsvImportRowInput = {
  id?: string;
  importId?: string;
  sourceRowNumber: number;
  canonicalKey: string;
  rawData: CsvRowRaw;
};

export type CsvImportRowStatus = 'pending' | 'imported' | 'skipped' | 'failed';

export type ResumableCsvImportRow = {
  id: string;
  import_id: string;
  source_row_number: number;
  canonical_key: string;
  raw_data: CsvRowRaw;
  status: Extract<CsvImportRowStatus, 'pending' | 'failed'>;
};

export async function listResumableCsvImports(
  userId: string,
): Promise<PersistenceResult<ResumableCsvImportRow[]>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: IMPORT_ERROR};

  try {
    const {data, error} = await client
      .from('csv_import_rows')
      .select('id, import_id, source_row_number, canonical_key, raw_data, status')
      .eq('owner_user_id', userId)
      .in('status', ['pending', 'failed'])
      .order('source_row_number', {ascending: true});

    return error || !data
      ? {data: null, error: IMPORT_ERROR}
      : {data: data as ResumableCsvImportRow[], error: null};
  } catch {
    return {data: null, error: IMPORT_ERROR};
  }
}

export async function createCsvImportBatch(
  userId: string,
  sourceFilename: string,
  rows: CsvImportRowInput[],
): Promise<PersistenceResult<{importId: string; rowIds: string[]}>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: IMPORT_ERROR};

  try {
    const {data: batch, error: batchError} = await client
      .from('csv_imports')
      .insert({
        owner_user_id: userId,
        source_filename: sourceFilename,
        status: 'uploaded',
        total_rows: rows.length,
        valid_rows: rows.length,
        invalid_rows: 0,
        duplicate_rows: 0,
      })
      .select('id')
      .single();

    if (batchError || !batch) return {data: null, error: IMPORT_ERROR};

    if (rows.length > 0) {
      const {data: insertedRows, error: rowsError} = await client
        .from('csv_import_rows')
        .insert(rows.map((row) => ({
          import_id: batch.id,
          owner_user_id: userId,
          source_row_number: row.sourceRowNumber,
          canonical_key: row.canonicalKey,
          raw_data: row.rawData,
          status: 'pending',
        })))
        .select('id');

      if (rowsError || !insertedRows || insertedRows.length !== rows.length) {
        return {data: null, error: IMPORT_ERROR};
      }

      return {
        data: {importId: batch.id, rowIds: insertedRows.map(({id}) => id)},
        error: null,
      };
    }

    return {data: {importId: batch.id, rowIds: []}, error: null};
  } catch {
    return {data: null, error: IMPORT_ERROR};
  }
}

export async function markCsvImportRow(
  userId: string,
  importId: string,
  rowId: string,
  status: CsvImportRowStatus,
  errorDetails: Record<string, unknown> | null,
): Promise<PersistenceResult<boolean>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: IMPORT_ERROR};

  try {
    const {data, error} = await client
      .from('csv_import_rows')
      .update({status, error_details: errorDetails})
      .eq('id', rowId)
      .eq('import_id', importId)
      .eq('owner_user_id', userId)
      .select('id')
      .single();

    return error || !data
      ? {data: null, error: IMPORT_ERROR}
      : {data: true, error: null};
  } catch {
    return {data: null, error: IMPORT_ERROR};
  }
}

export async function updateCsvImportStatus(
  userId: string,
  importId: string,
  status: 'validating' | 'ready' | 'importing' | 'completed' | 'failed',
): Promise<PersistenceResult<boolean>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: IMPORT_ERROR};

  try {
    const {data, error} = await client
      .from('csv_imports')
      .update({
        status,
        ...(status === 'completed' ? {completed_at: new Date().toISOString()} : {}),
      })
      .eq('id', importId)
      .eq('owner_user_id', userId)
      .select('id')
      .single();

    return error || !data
      ? {data: null, error: IMPORT_ERROR}
      : {data: true, error: null};
  } catch {
    return {data: null, error: IMPORT_ERROR};
  }
}
