import type {Word} from '../../types';
import type {CsvRowRaw} from '../../types';

export type ImportRoute =
  | {kind: 'link_global'; existingWordId: string}
  | {kind: 'edit_suggestion'; existingWordId: string; differingFields: string[]}
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
  const differingFields: string[] = [];
  if (normalize(meaning?.meaning ?? '') !== normalize(row.vietnameseMeaning)) differingFields.push('vietnameseMeaning');
  if (normalize(meaning?.partOfSpeech ?? 'noun') !== normalize(row.partOfSpeech ?? 'noun')) differingFields.push('partOfSpeech');
  return differingFields.length === 0
    ? {kind: 'link_global', existingWordId: match.id}
    : {kind: 'edit_suggestion', existingWordId: match.id, differingFields};
}
