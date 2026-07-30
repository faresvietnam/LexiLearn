import {describe, expect, it} from 'vitest';
import {parseCsv} from './csvParser';

describe('parseCsv', () => {
  it('parses quoted commas, escaped quotes, and multiline fields', () => {
    const result = parseCsv(
      '\ufeffWord,Meaning,Part of Speech\n"well-being","A ""good"", useful state",noun\n"multi\nline",Example,verb',
    );

    expect(result.invalidRows).toEqual([]);
    expect(result.rows).toMatchObject([
      {rowNumber: 2, word: 'well-being', vietnameseMeaning: 'A "good", useful state'},
      {rowNumber: 3, word: 'multi\nline', partOfSpeech: 'verb'},
    ]);
  });

  it('normalizes supported headers and rejects rows missing required fields', () => {
    const result = parseCsv(
      ' English Word , Nghĩa tiếng Việt , POS, IPA\ntransportation,Giao thông,noun,/x/\n,Thiếu từ,verb,/y/\nvalid,,noun,/z/',
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      word: 'transportation',
      vietnameseMeaning: 'Giao thông',
      partOfSpeech: 'noun',
      ipa: '/x/',
    });
    expect(result.invalidRows).toEqual([
      {rowNumber: 3, errors: ['word is required']},
      {rowNumber: 4, errors: ['vietnameseMeaning is required']},
    ]);
  });

  it('keeps the first duplicate and reports later rows by canonical spelling and lexical type', () => {
    const result = parseCsv(
      'word,meaning,part_of_speech\nWell-being,first,noun\nwell being,second,noun\nwell being,verb form,verb',
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].vietnameseMeaning).toBe('first');
    expect(result.duplicates).toEqual([
      {canonicalKey: 'wellbeing|noun', keptRowNumber: 2, duplicateRowNumber: 3},
    ]);
  });

  it('reports malformed CSV rows with their source row number', () => {
    const result = parseCsv('word,meaning\n"unclosed,meaning\nvalid,ok');

    expect(result.invalidRows).toContainEqual({
      rowNumber: 2,
      errors: ['unclosed quoted field'],
    });
  });
});
