import type {JsonWordInput, Word} from '../../types';

export type ImportRoute =
  | {kind: 'link_global'; existingWordId: string}
  | {kind: 'duplicate_private'; existingWordId: string}
  | {kind: 'create_private'};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sameWord(left: string, right: string) {
  return normalize(left) === normalize(right);
}

export function routeImportedRow(
  entry: Pick<JsonWordInput, 'word' | 'meanings'>,
  existingWords: Word[],
): ImportRoute {
  const match = existingWords.find((word) => sameWord(word.word, entry.word));
  if (!match) return {kind: 'create_private'};
  if (!match.isGlobal) return {kind: 'duplicate_private', existingWordId: match.id};

  const firstMeaning = entry.meanings[0];
  const meaning = match.meanings[0];
  if (
    normalize(meaning?.meaning ?? '') === normalize(firstMeaning?.meaning_vi ?? '')
    && normalize(meaning?.partOfSpeech ?? 'noun') === normalize(firstMeaning?.part_of_speech ?? 'noun')
  ) {
    return {kind: 'link_global', existingWordId: match.id};
  }

  // A conflicting import remains a separate private word; there is no
  // moderation or Global edit-suggestion workflow anymore.
  return {kind: 'create_private'};
}
