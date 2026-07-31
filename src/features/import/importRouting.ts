import type {Word} from '../../types';
import type {CsvRowRaw} from '../../types';

export type ImportRoute =
  | {kind: 'link_global'; existingWordId: string}
  | {kind: 'duplicate_private'; existingWordId: string}
  | {kind: 'create_private'};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sameWord(left: string, right: string) {
  return normalize(left) === normalize(right);
}

export function routeImportedRow(row: Pick<CsvRowRaw, 'word' | 'vietnameseMeaning' | 'partOfSpeech'>, existingWords: Word[]): ImportRoute {
  const match = existingWords.find((word) => sameWord(word.word, row.word));
  if (!match) return {kind: 'create_private'};
  if (!match.isGlobal) return {kind: 'duplicate_private', existingWordId: match.id};

  const meaning = match.meanings[0];
  if (
    normalize(meaning?.meaning ?? '') === normalize(row.vietnameseMeaning)
    && normalize(meaning?.partOfSpeech ?? 'noun') === normalize(row.partOfSpeech ?? 'noun')
  ) {
    return {kind: 'link_global', existingWordId: match.id};
  }

  // A conflicting import remains a separate private word; there is no
  // moderation or Global edit-suggestion workflow anymore.
  return {kind: 'create_private'};
}
