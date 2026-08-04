import {describe, expect, it, vi} from 'vitest';
import type {Deck, Tag} from '../../types';
import {matchDeckByName, matchTagByName, resolveJsonImportWords} from './jsonImportResolver';

const deck = (overrides: Partial<Deck> = {}): Deck => ({
  id: 'deck-1', name: 'IELTS', color: '#3B82F6', createdAt: '2026-08-01', ...overrides,
});
const tag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 'tag-1', name: 'daily', color: '#10B981', ...overrides,
});

describe('matchDeckByName / matchTagByName', () => {
  it('matches case-insensitively and trims whitespace', () => {
    expect(matchDeckByName(' ielts ', [deck()])).toEqual(deck());
    expect(matchTagByName('DAILY', [tag()])).toEqual(tag());
  });

  it('returns undefined when nothing matches', () => {
    expect(matchDeckByName('toefl', [deck()])).toBeUndefined();
  });
});

describe('resolveJsonImportWords', () => {
  it('reuses an existing deck/tag by name without creating a new one', async () => {
    const createDeck = vi.fn();
    const createTag = vi.fn();

    const [word] = await resolveJsonImportWords(
      [{word: 'run', deck_name: 'IELTS', tag_names: ['daily'], meanings: [{meaning_vi: 'chạy', part_of_speech: 'verb'}]}],
      [deck()],
      [tag()],
      createDeck,
      createTag,
    );

    expect(createDeck).not.toHaveBeenCalled();
    expect(createTag).not.toHaveBeenCalled();
    expect(word.deckId).toBe('deck-1');
    expect(word.tags).toEqual(['tag-1']);
  });

  it('creates a missing deck/tag exactly once even if repeated across entries', async () => {
    const createDeck = vi.fn().mockResolvedValue(deck({id: 'deck-new', name: 'TOEFL'}));
    const createTag = vi.fn().mockResolvedValue(tag({id: 'tag-new', name: 'toeic'}));

    const words = await resolveJsonImportWords(
      [
        {word: 'run', deck_name: 'TOEFL', tag_names: ['toeic'], meanings: [{meaning_vi: 'chạy', part_of_speech: 'verb'}]},
        {word: 'walk', deck_name: 'TOEFL', tag_names: ['toeic'], meanings: [{meaning_vi: 'đi bộ', part_of_speech: 'verb'}]},
      ],
      [],
      [],
      createDeck,
      createTag,
    );

    expect(createDeck).toHaveBeenCalledTimes(1);
    expect(createTag).toHaveBeenCalledTimes(1);
    expect(words[0].deckId).toBe('deck-new');
    expect(words[1].deckId).toBe('deck-new');
    expect(words[0].tags).toEqual(['tag-new']);
  });

  it('leaves deckId empty and tags empty when the entry has none', async () => {
    const [word] = await resolveJsonImportWords(
      [{word: 'run', meanings: [{meaning_vi: 'chạy', part_of_speech: 'verb'}]}],
      [],
      [],
      vi.fn(),
      vi.fn(),
    );

    expect(word.deckId).toBe('');
    expect(word.tags).toEqual([]);
  });

  it('leaves deckId empty when deck creation fails (createDeck resolves null)', async () => {
    const [word] = await resolveJsonImportWords(
      [{word: 'run', deck_name: 'TOEFL', meanings: [{meaning_vi: 'chạy', part_of_speech: 'verb'}]}],
      [],
      [],
      vi.fn().mockResolvedValue(null),
      vi.fn(),
    );

    expect(word.deckId).toBe('');
  });
});
