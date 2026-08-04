import type {Deck, JsonWordInput, Tag, Word} from '../../types';
import {buildImportedWord} from './jsonWordBuilder';

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

export function matchDeckByName(name: string, decks: Deck[]): Deck | undefined {
  const target = normalizeName(name);
  return decks.find((deck) => normalizeName(deck.name) === target);
}

export function matchTagByName(name: string, tags: Tag[]): Tag | undefined {
  const target = normalizeName(name);
  return tags.find((tag) => normalizeName(tag.name) === target);
}

export async function resolveJsonImportWords(
  entries: JsonWordInput[],
  decks: Deck[],
  tags: Tag[],
  createDeck: (deck: Deck) => Promise<Deck | null>,
  createTag: (tag: Tag) => Promise<Tag | null>,
): Promise<Word[]> {
  const deckByName = new Map<string, Deck>();
  decks.forEach((deck) => deckByName.set(normalizeName(deck.name), deck));
  const tagByName = new Map<string, Tag>();
  tags.forEach((tag) => tagByName.set(normalizeName(tag.name), tag));

  const words: Word[] = [];
  for (const [index, entry] of entries.entries()) {
    let deckId = '';
    if (entry.deck_name) {
      const key = normalizeName(entry.deck_name);
      let deck = deckByName.get(key);
      if (!deck) {
        const created = await createDeck({
          id: `deck_json_${Date.now()}_${index}`,
          name: entry.deck_name.trim(),
          color: '#3B82F6',
          createdAt: new Date().toISOString().split('T')[0],
        });
        if (created) {
          deck = created;
          deckByName.set(key, created);
        }
      }
      if (deck) deckId = deck.id;
    }

    const tagIds: string[] = [];
    for (const tagName of entry.tag_names ?? []) {
      const key = normalizeName(tagName);
      let tag = tagByName.get(key);
      if (!tag) {
        const created = await createTag({
          id: `tag_json_${Date.now()}_${index}_${key.replace(/\s+/g, '_')}`,
          name: tagName.trim(),
          color: '#10B981',
        });
        if (created) {
          tag = created;
          tagByName.set(key, created);
        }
      }
      if (tag) tagIds.push(tag.id);
    }

    words.push(buildImportedWord(entry, deckId, tagIds));
  }
  return words;
}
