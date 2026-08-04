import type {
  JsonWordExampleInput,
  JsonWordInput,
  JsonWordMeaningInput,
  JsonWordPartInput,
  WordPartType,
} from '../../types';

export type JsonImportInvalidEntry = {index: number; errors: string[]};
export type JsonImportDuplicate = {index: number; keptIndex: number};
export type ParsedJsonEntry = JsonWordInput & {index: number; canonicalKey: string};

export type JsonImportParseResult = {
  fileError: string | null;
  entries: ParsedJsonEntry[];
  invalid: JsonImportInvalidEntry[];
  duplicates: JsonImportDuplicate[];
};

const WORD_PART_TYPES: WordPartType[] = [
  'prefix', 'root', 'base', 'suffix', 'combining_form', 'compound_component',
];
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const STUDY_STATUSES = ['active', 'paused', 'archived'] as const;

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function validateExample(
  raw: unknown,
  meaningIndex: number,
  exampleIndex: number,
  errors: string[],
): JsonWordExampleInput | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`meanings[${meaningIndex}].examples[${exampleIndex}] must be an object`);
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (!isNonEmptyString(value.sentence)) {
    errors.push(`meanings[${meaningIndex}].examples[${exampleIndex}].sentence is required`);
    return null;
  }
  const difficulty = DIFFICULTIES.find((candidate) => candidate === value.difficulty);
  return {
    sentence: value.sentence.trim(),
    ...(isNonEmptyString(value.expected_answer) ? {expected_answer: value.expected_answer.trim()} : {}),
    ...(isNonEmptyString(value.word_form) ? {word_form: value.word_form.trim()} : {}),
    ...(difficulty ? {difficulty} : {}),
  };
}

function validateMeaning(
  raw: unknown,
  meaningIndex: number,
  errors: string[],
): JsonWordMeaningInput | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`meanings[${meaningIndex}] must be an object`);
    return null;
  }
  const value = raw as Record<string, unknown>;
  const hasMeaningVi = isNonEmptyString(value.meaning_vi);
  const hasPartOfSpeech = isNonEmptyString(value.part_of_speech);
  if (!hasMeaningVi) errors.push(`meanings[${meaningIndex}].meaning_vi is required`);
  if (!hasPartOfSpeech) errors.push(`meanings[${meaningIndex}].part_of_speech is required`);

  const examplesRaw = Array.isArray(value.examples) ? value.examples : [];
  const examples: JsonWordExampleInput[] = [];
  examplesRaw.forEach((rawExample, exampleIndex) => {
    const example = validateExample(rawExample, meaningIndex, exampleIndex, errors);
    if (example) examples.push(example);
  });

  if (!hasMeaningVi || !hasPartOfSpeech) return null;
  return {
    meaning_vi: (value.meaning_vi as string).trim(),
    part_of_speech: (value.part_of_speech as string).trim(),
    ...(isNonEmptyString(value.definition_en) ? {definition_en: value.definition_en.trim()} : {}),
    ...(examples.length > 0 ? {examples} : {}),
  };
}

function validatePart(
  raw: unknown,
  partIndex: number,
  errors: string[],
): JsonWordPartInput | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`parts[${partIndex}] must be an object`);
    return null;
  }
  const value = raw as Record<string, unknown>;
  const hasText = isNonEmptyString(value.text);
  if (!hasText) errors.push(`parts[${partIndex}].text is required`);
  const type = WORD_PART_TYPES.find((candidate) => candidate === value.type);
  if (!type) {
    errors.push(`parts[${partIndex}].type must be one of ${WORD_PART_TYPES.join(', ')}`);
  }
  if (!hasText || !type) return null;
  return {
    text: (value.text as string).trim(),
    type,
    ...(isNonEmptyString(value.meaning) ? {meaning: value.meaning.trim()} : {}),
  };
}

function validateEntry(raw: unknown, errors: string[]): JsonWordInput | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('entry must be an object');
    return null;
  }
  const value = raw as Record<string, unknown>;
  const hasWord = isNonEmptyString(value.word);
  if (!hasWord) errors.push('word is required');

  const meaningsRaw = Array.isArray(value.meanings) ? value.meanings : [];
  if (meaningsRaw.length === 0) errors.push('meanings must be a non-empty array');
  const meanings: JsonWordMeaningInput[] = [];
  meaningsRaw.forEach((rawMeaning, meaningIndex) => {
    const meaning = validateMeaning(rawMeaning, meaningIndex, errors);
    if (meaning) meanings.push(meaning);
  });

  const partsRaw = Array.isArray(value.parts) ? value.parts : [];
  const parts: JsonWordPartInput[] = [];
  partsRaw.forEach((rawPart, partIndex) => {
    const part = validatePart(rawPart, partIndex, errors);
    if (part) parts.push(part);
  });

  const tagNamesRaw = Array.isArray(value.tag_names) ? value.tag_names : [];
  const tagNames = tagNamesRaw.filter(isNonEmptyString).map((name) => name.trim());

  if (errors.length > 0) return null;

  const studyStatus = STUDY_STATUSES.find((candidate) => candidate === value.study_status);
  return {
    word: (value.word as string).trim(),
    ...(isNonEmptyString(value.ipa) ? {ipa: value.ipa.trim()} : {}),
    ...(isNonEmptyString(value.audio_url) ? {audio_url: value.audio_url.trim()} : {}),
    ...(isNonEmptyString(value.image_url) ? {image_url: value.image_url.trim()} : {}),
    ...(isNonEmptyString(value.deck_name) ? {deck_name: value.deck_name.trim()} : {}),
    ...(tagNames.length > 0 ? {tag_names: tagNames} : {}),
    ...(studyStatus ? {study_status: studyStatus} : {}),
    meanings,
    ...(parts.length > 0 ? {parts} : {}),
  };
}

export function parseJsonImport(text: string): JsonImportParseResult {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return {fileError: 'invalid JSON', entries: [], invalid: [], duplicates: []};
  }
  if (!Array.isArray(root)) {
    return {fileError: 'JSON root must be an array', entries: [], invalid: [], duplicates: []};
  }

  const entries: ParsedJsonEntry[] = [];
  const invalid: JsonImportInvalidEntry[] = [];
  const duplicates: JsonImportDuplicate[] = [];
  const keptIndexByKey = new Map<string, number>();

  root.forEach((raw, index) => {
    const errors: string[] = [];
    const value = validateEntry(raw, errors);
    if (!value) {
      invalid.push({index, errors});
      return;
    }
    const canonicalKey = `${normalizeKey(value.word)}|${normalizeKey(value.meanings[0].part_of_speech)}`;
    const keptIndex = keptIndexByKey.get(canonicalKey);
    if (keptIndex !== undefined) {
      duplicates.push({index, keptIndex});
      return;
    }
    keptIndexByKey.set(canonicalKey, index);
    entries.push({...value, index, canonicalKey});
  });

  return {fileError: null, entries, invalid, duplicates};
}
