import {describe, expect, it} from 'vitest';
import {buildImportedWord} from './csvWordBuilder';

describe('buildImportedWord', () => {
  it('builds a pending studyable word from a persisted CSV row', () => {
    const word = buildImportedWord({
      word: 'transportation',
      vietnameseMeaning: 'giao thông vận tải',
      partOfSpeech: 'noun',
      prefix: 'trans',
      root: 'port',
      suffix: 'ation',
    });

    expect(word).toMatchObject({
      word: 'transportation',
      approvalStatus: 'pending',
      status: 'active',
      meanings: [{meaning: 'giao thông vận tải', partOfSpeech: 'noun'}],
    });
    expect(word.wordStructure.map(({type}) => type)).toEqual(['prefix', 'root', 'suffix']);
  });
});
