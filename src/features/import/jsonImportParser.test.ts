import {describe, expect, it} from 'vitest';
import {parseJsonImport} from './jsonImportParser';

const validEntry = {
  word: 'transportation',
  ipa: '/ˌtrænspɔːrˈteɪʃn/',
  deck_name: 'IELTS',
  tag_names: ['daily', 'toeic'],
  meanings: [
    {
      meaning_vi: 'giao thông vận tải',
      part_of_speech: 'noun',
      definition_en: 'the movement of people or goods',
      examples: [{
        sentence: 'Public transportation is convenient.',
        sentence_vi: 'Giao thông công cộng rất tiện lợi.',
      }],
    },
  ],
  parts: [
    {text: 'trans', type: 'prefix'},
    {text: 'port', type: 'root', meaning: 'chở'},
    {text: 'ation', type: 'suffix'},
  ],
};

describe('parseJsonImport', () => {
  it('reports a file-level error when the JSON is malformed', () => {
    const result = parseJsonImport('{not valid json');
    expect(result.fileError).toBe('invalid JSON');
    expect(result.entries).toEqual([]);
  });

  it('reports a file-level error when the root is not an array', () => {
    const result = parseJsonImport('{"word": "run"}');
    expect(result.fileError).toBe('JSON root must be an array');
  });

  it('parses a fully-populated entry without inventing any field', () => {
    const result = parseJsonImport(JSON.stringify([validEntry]));

    expect(result.fileError).toBeNull();
    expect(result.invalid).toEqual([]);
    expect(result.entries).toEqual([{
      ...validEntry,
      index: 0,
      canonicalKey: 'transportation|noun',
    }]);
  });

  it('collects per-entry errors without dropping the whole file', () => {
    const result = parseJsonImport(JSON.stringify([
      {word: '', meanings: [{meaning_vi: 'x', part_of_speech: 'noun'}]},
      {word: 'valid', meanings: []},
      {word: 'ok', meanings: [{meaning_vi: '', part_of_speech: ''}]},
      validEntry,
    ]));

    expect(result.invalid).toEqual([
      {index: 0, errors: ['word is required']},
      {index: 1, errors: ['meanings must be a non-empty array']},
      {index: 2, errors: [
        'meanings[0].meaning_vi is required',
        'meanings[0].part_of_speech is required',
      ]},
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].word).toBe('transportation');
  });

  it('rejects an example with no sentence and a part with an invalid type', () => {
    const result = parseJsonImport(JSON.stringify([{
      word: 'run',
      meanings: [{
        meaning_vi: 'chạy',
        part_of_speech: 'verb',
        examples: [{sentence: ''}],
      }],
      parts: [{text: 'run', type: 'not-a-real-type'}],
    }]));

    expect(result.invalid).toEqual([{
      index: 0,
      errors: [
        'meanings[0].examples[0].sentence is required',
        'parts[0].type must be one of prefix, root, base, suffix, combining_form, compound_component',
      ],
    }]);
  });

  it('keeps the first duplicate word+part_of_speech pair and reports the rest', () => {
    const result = parseJsonImport(JSON.stringify([
      {word: 'Well-Being', meanings: [{meaning_vi: 'first', part_of_speech: 'noun'}]},
      {word: 'well being', meanings: [{meaning_vi: 'second', part_of_speech: 'noun'}]},
      {word: 'well being', meanings: [{meaning_vi: 'third', part_of_speech: 'verb'}]},
    ]));

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].meanings[0].meaning_vi).toBe('first');
    expect(result.duplicates).toEqual([{index: 1, keptIndex: 0}]);
  });
});
