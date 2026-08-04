import {describe, expect, it} from 'vitest';
import type {Word} from '../../types';
import {routeImportedRow} from './importRouting';

const existingWord = (overrides: Partial<Word> = {}): Word => ({
  id: 'word-1',
  word: 'well-being',
  wordStructure: [],
  wordFamily: ['well-being'],
  isGlobal: true,
  approvalStatus: 'approved',
  createdBy: 'admin',
  createdAt: '2026-07-30',
  deckId: 'deck-1',
  tags: [],
  status: 'active',
  meanings: [{
    id: 'meaning-1', wordId: 'word-1', meaning: 'trạng thái tốt', partOfSpeech: 'noun',
    exampleSentences: [], memoryStrength: 'critical', memoryScore: 20,
    reviewIntervalDays: 1, nextReviewDate: '2026-07-30', firstAttemptErrorRate: 0,
    forgottenWordParts: [], history: [],
  }],
  ...overrides,
});

const entry = {
  word: 'well being',
  meanings: [{meaning_vi: 'trạng thái tốt', part_of_speech: 'noun'}],
};

describe('routeImportedRow', () => {
  it('links an identical Global Word', () => {
    expect(routeImportedRow(entry, [existingWord()])).toMatchObject({kind: 'link_global', existingWordId: 'word-1'});
  });

  it('creates a private word for differing Global content', () => {
    expect(routeImportedRow(
      {...entry, meanings: [{meaning_vi: 'sức khỏe', part_of_speech: 'noun'}]},
      [existingWord()],
    )).toEqual({kind: 'create_private'});
  });

  it('reports an existing Private duplicate without creating another word', () => {
    expect(routeImportedRow(entry, [existingWord({isGlobal: false, approvalStatus: 'approved'})])).toMatchObject({
      kind: 'duplicate_private', existingWordId: 'word-1',
    });
  });

  it('routes an unknown word to a new private Word', () => {
    expect(routeImportedRow({...entry, word: 'new word'}, [])).toEqual({kind: 'create_private'});
  });
});
