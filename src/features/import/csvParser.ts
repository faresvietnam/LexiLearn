import type {CsvRowRaw} from '../../types';

export type CsvInvalidRow = {
  rowNumber: number;
  errors: string[];
};

export type CsvDuplicate = {
  canonicalKey: string;
  keptRowNumber: number;
  duplicateRowNumber: number;
};

export type ParsedCsvRow = CsvRowRaw & {
  rowNumber: number;
  canonicalKey: string;
};

export type CsvParseResult = {
  headers: string[];
  rows: ParsedCsvRow[];
  invalidRows: CsvInvalidRow[];
  duplicates: CsvDuplicate[];
};

type RecordResult = {fields: string[]; rowNumber: number; errors: string[]};

const HEADER_ALIASES: Record<keyof CsvRowRaw, string[]> = {
  word: ['word', 'englishword', 'term', 'tienganh'],
  vietnameseMeaning: ['vietnam meaning', 'vietnamese meaning', 'meaning', 'meaningvi', 'nghiatiengviet', 'nghia'],
  partOfSpeech: ['partofspeech', 'pos', 'lexicaltype', 'tuloai'],
  ipa: ['ipa', 'pronunciation', 'phonetic'],
  deck: ['deck'],
  tags: ['tags', 'tag'],
  prefix: ['prefix'],
  root: ['root'],
  suffix: ['suffix'],
  exampleSentence: ['examplesentence', 'example', 'sentence'],
};

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeWord(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function readRecords(text: string): RecordResult[] {
  const records: RecordResult[] = [];
  let fields: string[] = [];
  let value = '';
  let quoted = false;
  let afterQuote = false;
  let rowNumber = 1;
  let recordStart = 1;
  let errors: string[] = [];

  const finishRecord = () => {
    if (fields.length > 0 || value.length > 0 || errors.length > 0) {
      fields.push(value);
      records.push({fields, rowNumber: recordStart, errors});
    }
    fields = [];
    value = '';
    errors = [];
    recordStart = rowNumber + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        value += character;
        if (character === '\n') rowNumber += 1;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ',') {
        fields.push(value);
        value = '';
        afterQuote = false;
      } else if (character === '\n') {
        finishRecord();
        rowNumber += 1;
        afterQuote = false;
      } else if (character === '\r' && next === '\n') {
        finishRecord();
        rowNumber += 1;
        index += 1;
        afterQuote = false;
      } else if (character.trim() !== '') {
        errors.push('unexpected characters after closing quote');
        afterQuote = false;
        value += character;
      }
      continue;
    }

    if (character === '"' && value.trim() === '') {
      quoted = true;
    } else if (character === ',') {
      fields.push(value);
      value = '';
    } else if (character === '\n') {
      finishRecord();
      rowNumber += 1;
    } else if (character === '\r' && next === '\n') {
      finishRecord();
      rowNumber += 1;
      index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) errors.push('unclosed quoted field');
  if (fields.length > 0 || value.length > 0 || errors.length > 0) finishRecord();
  return records;
}

function fieldIndex(headers: string[], field: keyof CsvRowRaw) {
  const aliases = HEADER_ALIASES[field];
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function valueAt(fields: string[], headers: string[], field: keyof CsvRowRaw) {
  const index = fieldIndex(headers, field);
  return index >= 0 ? fields[index]?.trim() ?? '' : '';
}

export function parseCsv(text: string): CsvParseResult {
  const records = readRecords(text.replace(/^\uFEFF/, ''));
  const headerRecord = records.shift();
  if (!headerRecord) {
    return {headers: [], rows: [], invalidRows: [], duplicates: []};
  }

  const headers = headerRecord.fields.map((header) => header.trim());
  const rows: ParsedCsvRow[] = [];
  const invalidRows: CsvInvalidRow[] = [];
  const duplicates: CsvDuplicate[] = [];
  const keptRows = new Map<string, number>();

  for (const record of records) {
    const word = valueAt(record.fields, headers, 'word');
    const vietnameseMeaning = valueAt(record.fields, headers, 'vietnameseMeaning');
    const partOfSpeech = valueAt(record.fields, headers, 'partOfSpeech') || 'noun';
    const errors = [...record.errors];
    if (errors.length === 0) {
      if (!word) errors.push('word is required');
      if (!vietnameseMeaning) errors.push('vietnameseMeaning is required');
    }
    if (errors.length > 0) {
      invalidRows.push({rowNumber: record.rowNumber, errors});
      continue;
    }

    const canonicalKey = `${normalizeWord(word)}|${normalizeWord(partOfSpeech) || 'noun'}`;
    const keptRowNumber = keptRows.get(canonicalKey);
    if (keptRowNumber !== undefined) {
      duplicates.push({canonicalKey, keptRowNumber, duplicateRowNumber: record.rowNumber});
      continue;
    }
    keptRows.set(canonicalKey, record.rowNumber);
    rows.push({
      rowNumber: record.rowNumber,
      canonicalKey,
      word,
      vietnameseMeaning,
      partOfSpeech,
      ipa: valueAt(record.fields, headers, 'ipa') || undefined,
      deck: valueAt(record.fields, headers, 'deck') || undefined,
      tags: valueAt(record.fields, headers, 'tags') || undefined,
      prefix: valueAt(record.fields, headers, 'prefix') || undefined,
      root: valueAt(record.fields, headers, 'root') || undefined,
      suffix: valueAt(record.fields, headers, 'suffix') || undefined,
      exampleSentence: valueAt(record.fields, headers, 'exampleSentence') || undefined,
    });
  }

  return {headers, rows, invalidRows, duplicates};
}
