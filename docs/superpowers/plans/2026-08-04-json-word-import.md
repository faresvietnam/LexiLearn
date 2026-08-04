# JSON Word Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch — user request). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSV word import with JSON word import, fixing the data-loss bugs the CSV path had (deck/tag silently dropped, fake IPA, single meaning/example only).

**Architecture:** New pure modules (`jsonImportParser.ts` validates raw JSON into typed entries, `jsonWordBuilder.ts` builds a `Word` from one resolved entry, `jsonImportResolver.ts` matches/creates decks & tags by name and drives the two together) feed a 3-step `JsonImportModal.tsx` (Upload → Preview → Summary). `App.tsx` keeps its existing persistence loop (`createPrivateWord`/`linkGlobalWord` via `routeImportedRow`), just fed by the new builder instead of `csvWordBuilder.ts`, and stops silently overwriting `deckId`/`tags`. CSV-only files are deleted at the end once nothing references them.

**Tech Stack:** React + TypeScript, Vitest + Testing Library (existing stack, no new dependencies).

## Global Constraints

- No new npm dependencies — this is native `JSON.parse` + existing React/Tailwind patterns.
- Field naming in JSON payloads is snake_case, matching `docs/superpowers/specs/2026-08-04-add-word-api-endpoint-design.md`'s RPC payload (`meaning_vi`, `part_of_speech`, `definition_en`, `audio_url`, `image_url`, `study_status`), except `deck_id`/`tag_ids` become `deck_name`/`tag_names`.
- Optional fields that are absent must stay absent on the built `Word` (no fabricated defaults like the old `/word/` fake IPA) — the only defaults allowed are the ones the spec names explicitly: `study_status` → `"active"`, example `expected_answer` → the word, example `word_form` → `"base"`, example `difficulty` → `"medium"`.
- Table names `csv_imports`/`csv_import_rows` and the repository type names `CsvImportRowInput`/`ResumableCsvImportRow`/`CsvImportRowStatus` in `src/features/persistence/importRepository.ts` stay as-is (no migration) — only the `rawData`/`raw_data` payload type changes from `CsvRowRaw` to `JsonWordInput`.
- Push directly to `main` after each task's tests pass (per user instruction) — no feature branch, no PR.
- No Supabase schema change is required by this plan (confirmed in the spec: `create_private_word` RPC and existing tables are reused unchanged). If a later task reveals one is needed, apply it directly via the Supabase MCP tools rather than a migration file review cycle.

---

## Task 1: JSON import types

**Files:**
- Modify: `src/types/index.ts` (add new types near the existing `CsvRowRaw` block, do **not** remove `CsvRowRaw`/`CsvImportConflict`/`CsvImportReport` yet — later tasks still depend on them until Task 9)

**Interfaces:**
- Produces: `JsonWordExampleInput`, `JsonWordMeaningInput`, `JsonWordPartInput`, `JsonWordInput` — consumed by Tasks 2, 3, 4, 6, 7, 8.

- [ ] **Step 1: Add the types**

Insert after the existing `CsvImportReport` interface (end of file) in `src/types/index.ts`:

```ts
export type JsonWordExampleInput = {
  sentence: string;
  expected_answer?: string;
  word_form?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type JsonWordMeaningInput = {
  meaning_vi: string;
  part_of_speech: string;
  definition_en?: string;
  examples?: JsonWordExampleInput[];
};

export type JsonWordPartInput = {
  text: string;
  type: WordPartType;
  meaning?: string;
};

export type JsonWordInput = {
  word: string;
  ipa?: string;
  audio_url?: string;
  image_url?: string;
  deck_name?: string;
  tag_names?: string[];
  study_status?: WordStudyStatus;
  meanings: JsonWordMeaningInput[];
  parts?: JsonWordPartInput[];
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (these types aren't consumed yet, so nothing else changes).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add JSON word import types"
git push origin main
```

---

## Task 2: JSON import parser

**Files:**
- Create: `src/features/import/jsonImportParser.ts`
- Test: `src/features/import/jsonImportParser.test.ts`

**Interfaces:**
- Consumes: `JsonWordInput`, `JsonWordMeaningInput`, `JsonWordPartInput`, `WordPartType`, `WordStudyStatus` from `../../types` (Task 1).
- Produces: `parseJsonImport(text: string): JsonImportParseResult`, types `ParsedJsonEntry`, `JsonImportInvalidEntry`, `JsonImportDuplicate`, `JsonImportParseResult` — consumed by Tasks 7, 8.

- [ ] **Step 1: Write the failing tests**

Create `src/features/import/jsonImportParser.test.ts`:

```ts
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
      examples: [{sentence: 'Public transportation is convenient.'}],
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/import/jsonImportParser.test.ts`
Expected: FAIL — `jsonImportParser` module not found.

- [ ] **Step 3: Implement the parser**

Create `src/features/import/jsonImportParser.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/import/jsonImportParser.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/import/jsonImportParser.ts src/features/import/jsonImportParser.test.ts
git commit -m "feat: add JSON word import parser"
git push origin main
```

---

## Task 3: JSON word builder

**Files:**
- Create: `src/features/import/jsonWordBuilder.ts`
- Test: `src/features/import/jsonWordBuilder.test.ts`

**Interfaces:**
- Consumes: `JsonWordInput` from `../../types` (Task 1).
- Produces: `buildImportedWord(entry: JsonWordInput, deckId: string, tagIds: string[]): Word` — consumed by Task 4 (`jsonImportResolver.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/features/import/jsonWordBuilder.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {buildImportedWord} from './jsonWordBuilder';

describe('buildImportedWord', () => {
  it('builds a studyable private word with every optional field populated', () => {
    const word = buildImportedWord({
      word: 'Transportation',
      ipa: '/ˌtrænspɔːrˈteɪʃn/',
      audio_url: 'https://example.com/run.mp3',
      image_url: 'https://example.com/run.png',
      study_status: 'paused',
      meanings: [{
        meaning_vi: 'giao thông vận tải',
        part_of_speech: 'noun',
        definition_en: 'the movement of people or goods',
        examples: [{
          sentence: 'Public transportation is convenient.',
          expected_answer: 'transportation',
          word_form: 'base',
          difficulty: 'easy',
        }],
      }],
      parts: [
        {text: 'trans', type: 'prefix'},
        {text: 'port', type: 'root', meaning: 'chở'},
      ],
    }, 'deck-1', ['tag-1', 'tag-2']);

    expect(word).toMatchObject({
      word: 'transportation',
      ipa: '/ˌtrænspɔːrˈteɪʃn/',
      audioUrl: 'https://example.com/run.mp3',
      imageUrl: 'https://example.com/run.png',
      isGlobal: false,
      approvalStatus: 'approved',
      status: 'paused',
      deckId: 'deck-1',
      tags: ['tag-1', 'tag-2'],
    });
    expect(word.meanings).toMatchObject([{
      meaning: 'giao thông vận tải',
      partOfSpeech: 'noun',
      definitionEn: 'the movement of people or goods',
    }]);
    expect(word.meanings[0].exampleSentences).toMatchObject([{
      sentence: 'Public transportation is convenient.',
      expectedAnswer: 'transportation',
      wordForm: 'base',
      difficulty: 'easy',
    }]);
    expect(word.wordStructure).toMatchObject([
      {text: 'trans', type: 'prefix', order: 1},
      {text: 'port', type: 'root', meaning: 'chở', order: 2},
    ]);
  });

  it('omits optional fields entirely instead of inventing values', () => {
    const word = buildImportedWord({
      word: 'run',
      meanings: [{meaning_vi: 'chạy', part_of_speech: 'verb'}],
    }, '', []);

    expect(word.ipa).toBeUndefined();
    expect(word.audioUrl).toBeUndefined();
    expect(word.imageUrl).toBeUndefined();
    expect(word.status).toBe('active');
    expect(word.wordStructure).toEqual([]);
    expect(word.meanings[0].exampleSentences).toEqual([]);
    expect(word.meanings[0].definitionEn).toBeUndefined();
  });

  it('defaults an example missing expected_answer/word_form/difficulty', () => {
    const word = buildImportedWord({
      word: 'run',
      meanings: [{
        meaning_vi: 'chạy',
        part_of_speech: 'verb',
        examples: [{sentence: 'I run every morning.'}],
      }],
    }, '', []);

    expect(word.meanings[0].exampleSentences[0]).toMatchObject({
      expectedAnswer: 'run',
      wordForm: 'base',
      difficulty: 'medium',
    });
  });

  it('builds multiple meanings, each with its own examples', () => {
    const word = buildImportedWord({
      word: 'run',
      meanings: [
        {meaning_vi: 'chạy', part_of_speech: 'verb', examples: [{sentence: 'I run.'}]},
        {meaning_vi: 'đường chạy', part_of_speech: 'noun'},
      ],
    }, '', []);

    expect(word.meanings).toHaveLength(2);
    expect(word.meanings[0].exampleSentences).toHaveLength(1);
    expect(word.meanings[1].exampleSentences).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/import/jsonWordBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builder**

Create `src/features/import/jsonWordBuilder.ts`:

```ts
import type {ExampleSentence, JsonWordInput, MeaningCard, Word, WordPart} from '../../types';

export function buildImportedWord(
  entry: JsonWordInput,
  deckId: string,
  tagIds: string[],
): Word {
  const normalizedWord = entry.word.trim().toLowerCase();
  const wordId = `word_json_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const wordStructure: WordPart[] = (entry.parts ?? []).map((part, index) => ({
    id: `wp_${wordId}_${index}`,
    text: part.text,
    type: part.type,
    order: index + 1,
    ...(part.meaning ? {meaning: part.meaning} : {}),
  }));

  const meanings: MeaningCard[] = entry.meanings.map((meaning, meaningIndex) => {
    const meaningCardId = `meaning_${wordId}_${meaningIndex}`;
    const exampleSentences: ExampleSentence[] = (meaning.examples ?? []).map((example, exampleIndex) => ({
      id: `ex_${meaningCardId}_${exampleIndex}`,
      meaningCardId,
      sentence: example.sentence,
      expectedAnswer: example.expected_answer || normalizedWord,
      baseWord: normalizedWord,
      wordForm: example.word_form || 'base',
      partOfSpeech: meaning.part_of_speech,
      difficulty: example.difficulty || 'medium',
      approvalStatus: 'approved',
    }));

    return {
      id: meaningCardId,
      wordId,
      meaning: meaning.meaning_vi,
      partOfSpeech: meaning.part_of_speech,
      ...(meaning.definition_en ? {definitionEn: meaning.definition_en} : {}),
      memoryStrength: 'critical',
      memoryScore: 20,
      reviewIntervalDays: 1,
      nextReviewDate: new Date().toISOString().split('T')[0],
      firstAttemptErrorRate: 0,
      forgottenWordParts: [],
      history: [],
      exampleSentences,
    };
  });

  return {
    id: wordId,
    word: normalizedWord,
    ...(entry.ipa ? {ipa: entry.ipa} : {}),
    ...(entry.audio_url ? {audioUrl: entry.audio_url} : {}),
    ...(entry.image_url ? {imageUrl: entry.image_url} : {}),
    wordStructure,
    wordFamily: [normalizedWord],
    isGlobal: false,
    approvalStatus: 'approved',
    createdBy: 'user_json_import',
    createdAt: new Date().toISOString().split('T')[0],
    deckId,
    tags: tagIds,
    status: entry.study_status ?? 'active',
    meanings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/import/jsonWordBuilder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/import/jsonWordBuilder.ts src/features/import/jsonWordBuilder.test.ts
git commit -m "feat: add JSON word builder"
git push origin main
```

---

## Task 4: Deck/tag name resolver

**Files:**
- Create: `src/features/import/jsonImportResolver.ts`
- Test: `src/features/import/jsonImportResolver.test.ts`

**Interfaces:**
- Consumes: `JsonWordInput` (Task 1), `buildImportedWord` (Task 3), `Deck`/`Tag`/`Word` from `../../types`.
- Produces: `matchDeckByName(name, decks): Deck | undefined`, `matchTagByName(name, tags): Tag | undefined`, `resolveJsonImportWords(entries, decks, tags, createDeck, createTag): Promise<Word[]>` — consumed by Tasks 7, 8.

- [ ] **Step 1: Write the failing tests**

Create `src/features/import/jsonImportResolver.test.ts`:

```ts
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
    expect(matchDeckByName(' ielts ', [deck()]))?.toEqual(deck());
    expect(matchTagByName('DAILY', [tag()]))?.toEqual(tag());
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/import/jsonImportResolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `src/features/import/jsonImportResolver.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/import/jsonImportResolver.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/import/jsonImportResolver.ts src/features/import/jsonImportResolver.test.ts
git commit -m "feat: add deck/tag name resolver for JSON import"
git push origin main
```

---

## Task 5: `routeImportedRow` takes nested meanings

**Files:**
- Modify: `src/features/import/importRouting.ts`
- Modify: `src/features/import/importRouting.test.ts`

**Interfaces:**
- Consumes: `JsonWordInput` from `../../types` (Task 1).
- Produces: `routeImportedRow(entry: Pick<JsonWordInput, 'word' | 'meanings'>, existingWords: Word[]): ImportRoute` (signature changed from the CSV flat-field version) — consumed by Task 8 (App.tsx) and Task 7 (JsonImportModal preview).

This task **breaks the CSV call sites** (`App.tsx`, `CsvImportModal.tsx` don't call this function directly — only `App.tsx::handleConfirmCsvImport` does). That's expected and fixed in Task 8; `npx tsc --noEmit` will show one error in `App.tsx` between this task and Task 8, which is fine for an inline, non-agent, single-session refactor being pushed straight to `main`.

- [ ] **Step 1: Update the test to the new signature (red)**

Replace the `row` fixture and calls in `src/features/import/importRouting.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/import/importRouting.test.ts`
Expected: FAIL — `routeImportedRow` still expects flat `vietnameseMeaning`/`partOfSpeech`.

- [ ] **Step 3: Update the implementation**

Replace the contents of `src/features/import/importRouting.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/import/importRouting.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/import/importRouting.ts src/features/import/importRouting.test.ts
git commit -m "feat: route JSON import entries by nested meanings"
git push origin main
```

---

## Task 6: `handleCreateDeck`/`handleCreateTag` return the created record

**Why:** `resolveJsonImportWords` (Task 4) needs the real database-assigned `id` of a newly created deck/tag. `saveDeck`/`saveTag` (`src/features/persistence/vocabularyRepository.ts:176-220`) already `insert()` without a client-supplied id and `.select()` the server-generated row back — but `App.tsx::handleCreateDeck`/`handleCreateTag` currently discard that and return only `boolean`. This task changes the return type to the created record (or `null` on failure); `boolean` truthiness checks at the one existing call site (`DecksAndTagsView.tsx`) keep working unchanged in spirit, just need their variable renamed.

**Files:**
- Modify: `src/App.tsx:601-629` (`handleCreateDeck`, `handleCreateTag`)
- Modify: `src/App.tsx:957-958` (prop wiring — types flow through automatically, no change needed here)
- Modify: `src/components/DecksAndTagsView.tsx:8-9` (prop types), `:28-46` (`handleCreateDeck` call site), `:48-59` (`handleCreateTag` call site)

**Interfaces:**
- Produces: `handleCreateDeck: (deck: Deck) => Promise<Deck | null>`, `handleCreateTag: (tag: Tag) => Promise<Tag | null>` — consumed by Task 8 (passed into `JsonImportModal`).

- [ ] **Step 1: Update `App.tsx`**

In `src/App.tsx`, replace:

```ts
  const handleCreateDeck = async (deck: Deck) => {
    let savedDeck = deck;
    if (client && user) {
      const result = await saveDeck(user.id, deck);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      savedDeck = result.data;
    }
    setDecks((prev) => [...prev, savedDeck]);
    showToast(`Đã tạo Deck "${savedDeck.name}".`);
    return true;
  };
```

with:

```ts
  const handleCreateDeck = async (deck: Deck): Promise<Deck | null> => {
    let savedDeck = deck;
    if (client && user) {
      const result = await saveDeck(user.id, deck);
      if (result.error) {
        showToast(result.error);
        return null;
      }
      savedDeck = result.data;
    }
    setDecks((prev) => [...prev, savedDeck]);
    showToast(`Đã tạo Deck "${savedDeck.name}".`);
    return savedDeck;
  };
```

And replace:

```ts
  const handleCreateTag = async (tag: Tag) => {
    let savedTag = tag;
    if (client && user) {
      const result = await saveTag(user.id, tag);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      savedTag = result.data;
    }
    setTags((prev) => [...prev, savedTag]);
    showToast(`Đã tạo Tag "${savedTag.name}".`);
    return true;
  };
```

with:

```ts
  const handleCreateTag = async (tag: Tag): Promise<Tag | null> => {
    let savedTag = tag;
    if (client && user) {
      const result = await saveTag(user.id, tag);
      if (result.error) {
        showToast(result.error);
        return null;
      }
      savedTag = result.data;
    }
    setTags((prev) => [...prev, savedTag]);
    showToast(`Đã tạo Tag "${savedTag.name}".`);
    return savedTag;
  };
```

- [ ] **Step 2: Update `DecksAndTagsView.tsx`**

In `src/components/DecksAndTagsView.tsx`, change the prop types:

```ts
  onCreateDeck: (deck: Deck) => Promise<Deck | null>;
  onCreateTag: (tag: Tag) => Promise<Tag | null>;
```

Change the `handleCreateDeck` body:

```ts
  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    setIsCreatingDeck(true);
    let created: Deck | null = null;
    try {
      created = await onCreateDeck({
        id: `deck_${Date.now()}`,
        name: newDeckName.trim(),
        description: newDeckDesc.trim(),
        color: newDeckColor,
        createdAt: new Date().toISOString().split('T')[0],
      });
    } finally {
      setIsCreatingDeck(false);
    }
    if (created) {
      setNewDeckName('');
      setNewDeckDesc('');
    }
  };
```

Change the `handleCreateTag` body:

```ts
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setIsCreatingTag(true);
    let created: Tag | null = null;
    try {
      created = await onCreateTag({
        id: `tag_${Date.now()}`,
        name: newTagName.trim(),
        color: newTagColor,
      });
    } finally {
      setIsCreatingTag(false);
    }
    if (created) setNewTagName('');
  };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: same pre-existing `routeImportedRow` call-site error from Task 5 in `App.tsx`, nothing new from this task.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/DecksAndTagsView.tsx
git commit -m "feat: return created deck/tag record instead of a boolean"
git push origin main
```

---

## Task 7: `JsonImportModal` component

This component assigns a `ParsedJsonEntry` into `CsvImportRowInput.rawData`, whose type is still `CsvRowRaw` until Task 8 retypes it — so `npx tsc --noEmit` shows one error in this file until then (same acknowledged, temporary situation as Task 5). `npx vitest run` is unaffected: Vitest transpiles TypeScript without type-checking, so the tests below run and pass on their own.

**Files:**
- Create: `src/components/JsonImportModal.tsx`
- Test: `src/components/JsonImportModal.test.tsx`

**Interfaces:**
- Consumes: `parseJsonImport`, `ParsedJsonEntry` (Task 2); `matchDeckByName`, `matchTagByName`, `resolveJsonImportWords` (Task 4); `routeImportedRow`, `ImportRoute` (Task 5); `CsvImportRowInput`, `ResumableCsvImportRow` from `../features/persistence/importRepository` (unchanged names, per Global Constraints); `Word`, `Deck`, `Tag` from `../types`.
- Produces: `JsonImportModal` React component with props:
  ```ts
  interface JsonImportModalProps {
    existingWords: Word[];
    decks: Deck[];
    tags: Tag[];
    onCreateDeck: (deck: Deck) => Promise<Deck | null>;
    onCreateTag: (tag: Tag) => Promise<Tag | null>;
    onConfirmImport: (
      newWords: Word[],
      rows: CsvImportRowInput[],
    ) => Promise<ImportSummary>;
    resumableRows?: ResumableCsvImportRow[];
    onResumeImport?: (rows: ResumableCsvImportRow[]) => void | Promise<void>;
    onClose: () => void;
  }
  ```
  consumed by Task 8 (`App.tsx`). Also exports `ImportSummary = {created: number; linked: number; skippedDuplicate: number; failed: number}`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/JsonImportModal.test.tsx`:

```tsx
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {JsonImportModal} from './JsonImportModal';

afterEach(cleanup);

function renderModal() {
  render(
    <JsonImportModal
      existingWords={[]}
      decks={[]}
      tags={[]}
      onCreateDeck={vi.fn()}
      onCreateTag={vi.fn()}
      onConfirmImport={vi.fn().mockResolvedValue({created: 0, linked: 0, skippedDuplicate: 0, failed: 0})}
      onClose={vi.fn()}
    />,
  );
}

describe('JsonImportModal validation flow', () => {
  it('parses an uploaded JSON file and reports duplicates and invalid entries before import', async () => {
    renderModal();
    const json = JSON.stringify([
      {word: 'well-being', meanings: [{meaning_vi: 'Trạng thái tốt', part_of_speech: 'noun'}]},
      {word: 'well being', meanings: [{meaning_vi: 'Trùng', part_of_speech: 'noun'}]},
      {word: '', meanings: [{meaning_vi: 'Thiếu từ', part_of_speech: 'noun'}]},
    ]);
    const file = new File([json], 'words.json', {type: 'application/json'});

    fireEvent.change(screen.getByLabelText('Tải file JSON'), {
      target: {files: [file]},
    });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(json));
    fireEvent.click(screen.getByRole('button', {name: /phân tích json/i}));

    expect(await screen.findByText('well-being')).toBeInTheDocument();
    expect(within(screen.getByText('Trùng lặp trong file:').parentElement!)
      .getByText('1')).toBeInTheDocument();
    expect(within(screen.getByText('Lỗi:').parentElement!)
      .getByText('1')).toBeInTheDocument();
  });

  it('keeps the existing paste workflow when no file is selected', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', {name: /phân tích json/i}));
    await waitFor(() => expect(screen.getByText('transportation')).toBeInTheDocument());
  });

  it('shows a summary after confirming import', async () => {
    const onConfirmImport = vi.fn().mockResolvedValue({created: 1, linked: 0, skippedDuplicate: 0, failed: 0});
    render(
      <JsonImportModal
        existingWords={[]}
        decks={[]}
        tags={[]}
        onCreateDeck={vi.fn()}
        onCreateTag={vi.fn()}
        onConfirmImport={onConfirmImport}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /phân tích json/i}));
    await screen.findByText('transportation');
    fireEvent.click(screen.getByRole('button', {name: /xác nhận import/i}));

    expect(await screen.findByText(/import json thành công/i)).toBeInTheDocument();
    expect(onConfirmImport).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/JsonImportModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/JsonImportModal.tsx`:

```tsx
import React, { useState } from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Word, Deck, Tag } from '../types';
import {parseJsonImport, type ParsedJsonEntry} from '../features/import/jsonImportParser';
import {matchDeckByName, matchTagByName, resolveJsonImportWords} from '../features/import/jsonImportResolver';
import {routeImportedRow, type ImportRoute} from '../features/import/importRouting';
import type {CsvImportRowInput, ResumableCsvImportRow} from '../features/persistence/importRepository';

export type ImportSummary = {
  created: number;
  linked: number;
  skippedDuplicate: number;
  failed: number;
};

interface JsonImportModalProps {
  existingWords: Word[];
  decks: Deck[];
  tags: Tag[];
  onCreateDeck: (deck: Deck) => Promise<Deck | null>;
  onCreateTag: (tag: Tag) => Promise<Tag | null>;
  onConfirmImport: (newWords: Word[], rows: CsvImportRowInput[]) => Promise<ImportSummary>;
  resumableRows?: ResumableCsvImportRow[];
  onResumeImport?: (rows: ResumableCsvImportRow[]) => void | Promise<void>;
  onClose: () => void;
}

const SAMPLE_JSON = `[
  {
    "word": "transportation",
    "deck_name": "IELTS",
    "tag_names": ["daily"],
    "meanings": [
      {
        "meaning_vi": "Giao thông vận tải",
        "part_of_speech": "noun",
        "examples": [{"sentence": "Public transportation is convenient."}]
      }
    ],
    "parts": [
      {"text": "trans", "type": "prefix"},
      {"text": "port", "type": "root", "meaning": "chở"},
      {"text": "ation", "type": "suffix"}
    ]
  }
]`;

type PreviewRow = {
  entry: ParsedJsonEntry;
  route: ImportRoute;
  deckWillCreate: boolean;
  tagsWillCreate: string[];
};

const ROUTE_LABEL: Record<ImportRoute['kind'], string> = {
  create_private: 'Sẽ tạo mới',
  link_global: 'Sẽ gộp vào Global Word',
  duplicate_private: 'Bỏ qua (đã có)',
};

export const JsonImportModal: React.FC<JsonImportModalProps> = ({
  existingWords,
  decks,
  tags,
  onCreateDeck,
  onCreateTag,
  onConfirmImport,
  resumableRows = [],
  onResumeImport,
  onClose,
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'summary'>('upload');
  const [rawText, setRawText] = useState<string>(SAMPLE_JSON);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [invalidEntries, setInvalidEntries] = useState<{index: number; errors: string[]}[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result ?? ''));
    reader.onerror = () => setRawText('');
    reader.readAsText(file);
  };

  const handleParse = () => {
    const result = parseJsonImport(rawText);
    if (result.fileError) {
      setFileError(result.fileError);
      setPreviewRows([]);
      setInvalidEntries([]);
      setDuplicateCount(0);
      return;
    }
    setFileError(null);
    setInvalidEntries(result.invalid);
    setDuplicateCount(result.duplicates.length);
    setPreviewRows(result.entries.map((entry) => ({
      entry,
      route: routeImportedRow(entry, existingWords),
      deckWillCreate: !!entry.deck_name && !matchDeckByName(entry.deck_name, decks),
      tagsWillCreate: (entry.tag_names ?? []).filter((name) => !matchTagByName(name, tags)),
    })));
    setStep('preview');
  };

  const handleConfirm = async () => {
    const entries = previewRows.map(({entry}) => entry);
    const rows: CsvImportRowInput[] = entries.map((entry) => ({
      sourceRowNumber: entry.index + 1,
      canonicalKey: entry.canonicalKey,
      rawData: entry,
    }));

    setIsImporting(true);
    try {
      const words = await resolveJsonImportWords(entries, decks, tags, onCreateDeck, onCreateTag);
      const result = await onConfirmImport(words, rows);
      setSummary(result);
      setStep('summary');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import từ vựng bằng JSON</h1>
        <p className="text-slate-500 text-sm">
          Quy trình 3 bước: Upload JSON → Preview → Confirm
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm text-slate-800">
        {step === 'upload' && (
          <div className="space-y-4">
            {resumableRows.length > 0 && onResumeImport && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <p className="text-sm font-bold text-amber-900">
                  Có {resumableRows.length} phần tử từ một lần import trước chưa hoàn tất.
                </p>
                <button
                  type="button"
                  onClick={() => void onResumeImport(resumableRows)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
                >
                  Tiếp tục import cũ
                </button>
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="json-file" className="text-xs font-bold text-slate-700">
                Tải file JSON
              </label>
              <input
                id="json-file"
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Dữ liệu JSON Sample (hoặc dán nội dung JSON)</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={14}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
              />
            </div>
            {fileError && (
              <p role="alert" className="text-xs text-rose-700">
                {fileError}
              </p>
            )}

            <button
              onClick={handleParse}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition"
            >
              <span>Phân tích JSON</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Số từ hợp lệ:</span>{' '}
                <strong className="text-emerald-700 font-bold">{previewRows.length}</strong>
              </div>
              <div>
                <span className="text-slate-500">Trùng lặp trong file:</span>{' '}
                <strong className="text-rose-600 font-bold">{duplicateCount}</strong>
              </div>
              <div>
                <span className="text-slate-500">Lỗi:</span>{' '}
                <strong className="text-amber-700 font-bold">{invalidEntries.length}</strong>
              </div>
            </div>

            {invalidEntries.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-bold">Các phần tử chưa hợp lệ</p>
                <ul className="mt-1 list-disc pl-5">
                  {invalidEntries.map((entry) => (
                    <li key={entry.index}>Phần tử #{entry.index + 1}: {entry.errors.join(', ')}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 text-xs">
              <table className="w-full text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="p-2.5">Word</th>
                    <th className="p-2.5">Nghĩa đầu tiên</th>
                    <th className="p-2.5">Deck</th>
                    <th className="p-2.5">Tags</th>
                    <th className="p-2.5">Route</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map(({entry, route, deckWillCreate, tagsWillCreate}) => (
                    <tr key={entry.index}>
                      <td className="p-2.5 font-bold text-slate-900">{entry.word}</td>
                      <td className="p-2.5">{entry.meanings[0]?.meaning_vi}</td>
                      <td className="p-2.5">
                        {entry.deck_name
                          ? `${entry.deck_name}${deckWillCreate ? ' (sẽ tạo mới)' : ''}`
                          : '-'}
                      </td>
                      <td className="p-2.5">
                        {(entry.tag_names ?? []).length === 0
                          ? '-'
                          : entry.tag_names!.map((name) => (
                            tagsWillCreate.includes(name) ? `${name} (mới)` : name
                          )).join(', ')}
                      </td>
                      <td className="p-2.5 font-semibold text-indigo-600">{ROUTE_LABEL[route.kind]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => void handleConfirm()}
              disabled={previewRows.length === 0 || isImporting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition disabled:opacity-50"
            >
              <span>{isImporting ? 'Đang import...' : 'Xác nhận Import'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'summary' && summary && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-bold text-slate-900">Import JSON thành công!</h3>

            <div className="grid grid-cols-2 gap-3 text-left text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200 text-slate-700">
              <div>Tạo mới: <strong className="text-emerald-700 font-bold">{summary.created}</strong></div>
              <div>Gộp vào Global: <strong className="text-indigo-600 font-bold">{summary.linked}</strong></div>
              <div>Bỏ qua (trùng): <strong className="text-rose-600 font-bold">{summary.skippedDuplicate}</strong></div>
              <div>Lỗi khi lưu: <strong className="text-amber-700 font-bold">{summary.failed}</strong></div>
            </div>

            <p className="text-xs text-slate-500">
              Các từ vừa import đã được tự động đưa vào Từ vựng cá nhân và có thể học ngay.
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition"
            >
              Đóng cửa sổ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/JsonImportModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/JsonImportModal.tsx src/components/JsonImportModal.test.tsx
git commit -m "feat: add JsonImportModal component"
git push origin main
```

---

## Task 8: Wire `JsonImportModal` into `App.tsx`, retype `importRepository.ts`, delete `CsvImportModal`

**Why delete `CsvImportModal.tsx` in this task instead of Task 9:** `CsvImportRowInput.rawData`/`ResumableCsvImportRow.raw_data` (`src/features/persistence/importRepository.ts`) currently type as `CsvRowRaw`. `JsonImportModal.tsx` (Task 7) assigns a `ParsedJsonEntry` (a `JsonWordInput`) into that same field — the two shapes are incompatible, so this field's type must change to `JsonWordInput` for `JsonImportModal.tsx` to typecheck. But `CsvImportModal.tsx` assigns a `CsvRowRaw` into that same field, so the moment the type changes, `CsvImportModal.tsx` stops compiling. Both can't hold at once, so `CsvImportModal.tsx`/`CsvImportModal.test.tsx` are deleted here, in the same task as the retype. `csvParser.ts`/`csvWordBuilder.ts` (+tests) don't reference `importRepository.ts` at all, so they're unaffected and stay until Task 9.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/persistence/importRepository.ts` (retype `rawData`/`raw_data` from `CsvRowRaw` to `JsonWordInput`)
- Delete: `src/components/CsvImportModal.tsx`, `src/components/CsvImportModal.test.tsx`

**Interfaces:**
- Consumes: `JsonImportModal`, `ImportSummary` (Task 7); `routeImportedRow` (Task 5); `resolveJsonImportWords` isn't called here (the modal calls it) — `App.tsx` only needs `routeImportedRow` and `buildImportedWord`-free persistence.
- Produces: `handleConfirmJsonImport(importedWords: Word[], importRows: CsvImportRowInput[]): Promise<ImportSummary>`, `handleResumeJsonImport(pendingRows: ResumableCsvImportRow[]): Promise<void>` — no further consumers (top-level App handlers).

- [ ] **Step 1: Retype `importRepository.ts` and delete `CsvImportModal`**

In `src/features/persistence/importRepository.ts`, replace:

```ts
import type {CsvRowRaw} from '../../types';
```

with:

```ts
import type {JsonWordInput} from '../../types';
```

Then replace every `CsvRowRaw` occurrence in that file with `JsonWordInput` — there are exactly two: `CsvImportRowInput.rawData: CsvRowRaw` (in the `CsvImportRowInput` type) and `ResumableCsvImportRow.raw_data: CsvRowRaw` (in the `ResumableCsvImportRow` type). No other line in the file references the type, and no function body changes — `raw_data`/`rawData` are passed through opaquely to Supabase's `jsonb` column either way.

Delete the now-incompatible CSV modal and its test:

```bash
git rm src/components/CsvImportModal.tsx src/components/CsvImportModal.test.tsx
```

- [ ] **Step 2: Swap the import statements**

In `src/App.tsx`, replace:

```ts
import { CsvImportModal } from './components/CsvImportModal';
```

with:

```ts
import { JsonImportModal } from './components/JsonImportModal';
```

Replace:

```ts
import {routeImportedRow} from './features/import/importRouting';
import {buildImportedWord} from './features/import/csvWordBuilder';
```

with:

```ts
import {routeImportedRow} from './features/import/importRouting';
import {resolveJsonImportWords} from './features/import/jsonImportResolver';
```

(`buildImportedWord` is no longer called directly from `App.tsx` — `resolveJsonImportWords`, used by both the modal's confirm step and the resume handler here, calls it internally.)

- [ ] **Step 3: Rename the modal state**

Replace:

```ts
  const [showCsvImportModal, setShowCsvImportModal] = useState<boolean>(false);
  const [resumableCsvRows, setResumableCsvRows] = useState<ResumableCsvImportRow[]>([]);
```

with:

```ts
  const [showJsonImportModal, setShowJsonImportModal] = useState<boolean>(false);
  const [resumableJsonRows, setResumableJsonRows] = useState<ResumableCsvImportRow[]>([]);
```

`showJsonImportModal` is currently unused dead state exactly like the CSV original (`currentTab === 'import_json'` drives rendering, not this flag) — keep it as-is for parity with the pre-existing pattern; it isn't this plan's job to clean that up.

Replace the resume-loading effect:

```ts
    void listResumableCsvImports(user.id).then((result) => {
      if (alive && result.data) setResumableCsvRows(result.data);
    });
```

with:

```ts
    void listResumableCsvImports(user.id).then((result) => {
      if (alive && result.data) setResumableJsonRows(result.data);
    });
```

- [ ] **Step 4: Rewrite `handleConfirmCsvImport` as `handleConfirmJsonImport`**

Replace the entire function (originally around `src/App.tsx:707-781`):

```ts
  const handleConfirmCsvImport = async (
    importedWords: Word[],
    importRows: CsvImportRowInput[],
  ) => {
    if (!client || !user) {
      setWords((prev) => [...importedWords, ...prev]);
      showToast(`Đã import thành công ${importedWords.length} từ vựng từ CSV!`);
      return;
    }

    const rows = importRows.map((row) => ({
      ...row,
      rawData: row.rawData,
    }));
    const existingImportId = rows.find(({importId}) => importId)?.importId;
    const batch = existingImportId
      ? {data: {importId: existingImportId, rowIds: rows.map(({id}) => id ?? '')}, error: null}
      : await createCsvImportBatch(user.id, 'csv-import.csv', rows);
    if (batch.error || !batch.data) {
      showToast(batch.error ?? 'Không thể bắt đầu import CSV.');
      return;
    }

    await updateCsvImportStatus(user.id, batch.data.importId, 'importing');
    const persistedWords: Word[] = [];
    let processedRows = 0;
    const rowIds = batch.data.rowIds;

    for (const [index, importedWord] of importedWords.entries()) {
      const wordForPersistence: Word = {
        ...importedWord,
        deckId: decks[0]?.id ?? '',
        tags: [],
      };
      const row = rows[index];
      const route = row
        ? routeImportedRow(row.rawData, words)
        : {kind: 'create_private' as const};
      let result = route.kind === 'create_private'
        ? await createPrivateWord(user.id, wordForPersistence)
        : {data: null, error: null};

      if (route.kind === 'duplicate_private') {
        result = {data: null, error: null};
      } else if (route.kind === 'link_global') {
        const globalMatch = globalWords.find((candidate) =>
          candidate.word.trim().toLowerCase() === importedWord.word.trim().toLowerCase(),
        );
        if (globalMatch) {
          result = await linkGlobalWord(user.id, globalMatch.id, decks[0]?.id ?? null);
        } else {
          result = {data: null, error: 'Không tìm thấy Global Word để liên kết.'};
        }
      }
      const rowId = rowIds[index];
      if (result.data && !result.error) {
        persistedWords.push(result.data);
        processedRows++;
        if (rowId) await markCsvImportRow(user.id, batch.data.importId, rowId, 'imported', null);
      } else if (route.kind === 'duplicate_private' && rowId) {
        processedRows++;
        await markCsvImportRow(user.id, batch.data.importId, rowId, 'skipped', {reason: 'duplicate_private'});
      } else if (rowId) {
        await markCsvImportRow(user.id, batch.data.importId, rowId, 'failed', {message: result.error});
      }
    }

    await updateCsvImportStatus(
      user.id,
      batch.data.importId,
      processedRows === importedWords.length ? 'completed' : 'failed',
    );
    setWords((prev) => [...persistedWords, ...prev]);
    showToast(`Đã lưu ${persistedWords.length}/${importedWords.length} từ CSV vào database.`);
  };
```

with:

```ts
  const handleConfirmJsonImport = async (
    importedWords: Word[],
    importRows: CsvImportRowInput[],
  ): Promise<ImportSummary> => {
    if (!client || !user) {
      setWords((prev) => [...importedWords, ...prev]);
      showToast(`Đã import thành công ${importedWords.length} từ vựng từ JSON!`);
      return {created: importedWords.length, linked: 0, skippedDuplicate: 0, failed: 0};
    }

    const rows = importRows.map((row) => ({
      ...row,
      rawData: row.rawData,
    }));
    const existingImportId = rows.find(({importId}) => importId)?.importId;
    const batch = existingImportId
      ? {data: {importId: existingImportId, rowIds: rows.map(({id}) => id ?? '')}, error: null}
      : await createCsvImportBatch(user.id, 'json-import.json', rows);
    if (batch.error || !batch.data) {
      showToast(batch.error ?? 'Không thể bắt đầu import JSON.');
      return {created: 0, linked: 0, skippedDuplicate: 0, failed: importedWords.length};
    }

    await updateCsvImportStatus(user.id, batch.data.importId, 'importing');
    const persistedWords: Word[] = [];
    let processedRows = 0;
    let created = 0;
    let linked = 0;
    let skippedDuplicate = 0;
    let failed = 0;
    const rowIds = batch.data.rowIds;

    for (const [index, importedWord] of importedWords.entries()) {
      const row = rows[index];
      const route = row
        ? routeImportedRow(row.rawData, words)
        : {kind: 'create_private' as const};
      let result = route.kind === 'create_private'
        ? await createPrivateWord(user.id, importedWord)
        : {data: null, error: null};

      if (route.kind === 'duplicate_private') {
        result = {data: null, error: null};
      } else if (route.kind === 'link_global') {
        const globalMatch = globalWords.find((candidate) =>
          candidate.word.trim().toLowerCase() === importedWord.word.trim().toLowerCase(),
        );
        if (globalMatch) {
          result = await linkGlobalWord(user.id, globalMatch.id, importedWord.deckId || null);
        } else {
          result = {data: null, error: 'Không tìm thấy Global Word để liên kết.'};
        }
      }
      const rowId = rowIds[index];
      if (result.data && !result.error) {
        persistedWords.push(result.data);
        processedRows++;
        if (route.kind === 'link_global') linked++; else created++;
        if (rowId) await markCsvImportRow(user.id, batch.data.importId, rowId, 'imported', null);
      } else if (route.kind === 'duplicate_private' && rowId) {
        processedRows++;
        skippedDuplicate++;
        await markCsvImportRow(user.id, batch.data.importId, rowId, 'skipped', {reason: 'duplicate_private'});
      } else if (rowId) {
        failed++;
        await markCsvImportRow(user.id, batch.data.importId, rowId, 'failed', {message: result.error});
      }
    }

    await updateCsvImportStatus(
      user.id,
      batch.data.importId,
      processedRows === importedWords.length ? 'completed' : 'failed',
    );
    setWords((prev) => [...persistedWords, ...prev]);
    showToast(`Đã lưu ${persistedWords.length}/${importedWords.length} từ JSON vào database.`);
    return {created, linked, skippedDuplicate, failed};
  };
```

Note two behavior fixes bundled into this rewrite (both directly required by the approved spec, not scope creep):
- The `deckId: decks[0]?.id ?? '', tags: []` override is gone — `importedWord` (already carrying the resolved `deckId`/`tags` from `resolveJsonImportWords`) is persisted as-is.
- `linkGlobalWord`'s deck argument changes from the hardcoded `decks[0]?.id ?? null` to `importedWord.deckId || null`, so linking a Global Word also respects the entry's requested deck instead of always the first one.

- [ ] **Step 5: Rewrite `handleResumeCsvImport` as `handleResumeJsonImport`**

Replace:

```ts
  const handleResumeCsvImport = async (pendingRows: ResumableCsvImportRow[]) => {
    const words = pendingRows.map(({raw_data}) => buildImportedWord(raw_data));
    await handleConfirmCsvImport(
      words,
      pendingRows.map(({id, import_id, source_row_number, canonical_key, raw_data}) => ({
        id,
        importId: import_id,
        sourceRowNumber: source_row_number,
        canonicalKey: canonical_key,
        rawData: raw_data,
      })),
    );
    setResumableCsvRows([]);
  };
```

with:

```ts
  const handleResumeJsonImport = async (pendingRows: ResumableCsvImportRow[]) => {
    const entries = pendingRows.map(({raw_data}) => raw_data);
    const words = await resolveJsonImportWords(entries, decks, tags, handleCreateDeck, handleCreateTag);
    await handleConfirmJsonImport(
      words,
      pendingRows.map(({id, import_id, source_row_number, canonical_key, raw_data}) => ({
        id,
        importId: import_id,
        sourceRowNumber: source_row_number,
        canonicalKey: canonical_key,
        rawData: raw_data,
      })),
    );
    setResumableJsonRows([]);
  };
```

- [ ] **Step 6: Swap the render block**

Replace (originally around `src/App.tsx:924-935`):

```tsx
          {currentTab === 'import_csv' && (
            <CsvImportModal
              existingWords={words}
              resumableRows={resumableCsvRows}
              onResumeImport={handleResumeCsvImport}
              onConfirmImport={async (newWords, importRows) => {
                await handleConfirmCsvImport(newWords, importRows);
                setCurrentTab('vocabulary');
              }}
              onClose={() => setCurrentTab('vocabulary')}
            />
          )}
```

with:

```tsx
          {currentTab === 'import_json' && (
            <JsonImportModal
              existingWords={words}
              decks={decks}
              tags={tags}
              onCreateDeck={handleCreateDeck}
              onCreateTag={handleCreateTag}
              resumableRows={resumableJsonRows}
              onResumeImport={handleResumeJsonImport}
              onConfirmImport={handleConfirmJsonImport}
              onClose={() => setCurrentTab('vocabulary')}
            />
          )}
```

This also fixes a pre-existing bug: the old wiring called `setCurrentTab('vocabulary')` immediately after `onConfirmImport` resolved, which unmounted `CsvImportModal` before its own `step === 'summary'` screen could ever render. Passing `handleConfirmJsonImport` directly lets `JsonImportModal` show its summary step; the existing "Đóng cửa sổ" button's `onClick={onClose}` is what now switches the tab back.

- [ ] **Step 7: Update the `ImportSummary` import**

Add `ImportSummary` to the type-only import from the modal, at the top of `src/App.tsx`:

```ts
import { JsonImportModal, type ImportSummary } from './components/JsonImportModal';
```

- [ ] **Step 8: Update the Navbar tab id/label/icon**

In `src/components/Navbar.tsx`, replace the `FileSpreadsheet` import with `FileJson`:

```ts
  FileJson,
```

(remove `FileSpreadsheet` from the same import block if nothing else in the file uses it — check with `grep -n "FileSpreadsheet" src/components/Navbar.tsx` after editing; it should only match the import line before this edit).

Replace:

```ts
    { id: 'import_csv', label: 'Import CSV', icon: FileSpreadsheet },
```

with:

```ts
    { id: 'import_json', label: 'Import JSON', icon: FileJson },
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Run the full test suite**

Run: `npx vitest run`
Expected: PASS for every remaining file, including `src/features/import/csvParser.test.ts` and `src/features/import/csvWordBuilder.test.ts` (they test `csvParser.ts`/`csvWordBuilder.ts`, which don't touch `importRepository.ts` and are still present, unchanged, until Task 9). `CsvImportModal.test.tsx` is gone (deleted in Step 1) so it no longer runs.

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx src/components/Navbar.tsx src/features/persistence/importRepository.ts
git commit -m "feat: wire JsonImportModal into App, retire CSV modal wiring"
git push origin main
```

---

## Task 9: Delete CSV-only files and types

**Files:**
- Delete: `src/features/import/csvParser.ts`, `src/features/import/csvParser.test.ts`
- Delete: `src/features/import/csvWordBuilder.ts`, `src/features/import/csvWordBuilder.test.ts`
- Modify: `src/types/index.ts` (remove `CsvRowRaw`, `CsvImportConflict`, `CsvImportReport`)

(`src/components/CsvImportModal.tsx`/`.test.tsx` were already deleted in Task 8, Step 1, because their type dependency on `importRepository.ts` had to change then — see that task's "Why" note.)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a pure deletion once Task 8 has removed the last references.

- [ ] **Step 1: Confirm nothing still references the CSV-only symbols**

Run:
```bash
grep -rn "CsvRowRaw\|CsvImportConflict\|CsvImportReport\|csvParser\|csvWordBuilder\|CsvImportModal" src --include="*.ts" --include="*.tsx"
```
Expected: only `src/features/import/csvParser.ts`, `csvParser.test.ts`, `csvWordBuilder.ts`, `csvWordBuilder.test.ts` (the four files about to be deleted here) and the three type declarations in `src/types/index.ts` (about to be removed here) — no references from `App.tsx`, `JsonImportModal.tsx`, `jsonImportParser.ts`, `jsonWordBuilder.ts`, `jsonImportResolver.ts`, `importRouting.ts`, or `importRepository.ts`. If anything else shows up, stop and fix that reference before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/features/import/csvParser.ts src/features/import/csvParser.test.ts
git rm src/features/import/csvWordBuilder.ts src/features/import/csvWordBuilder.test.ts
```

- [ ] **Step 3: Remove the CSV-only types**

In `src/types/index.ts`, delete the `CsvRowRaw`, `CsvImportConflict`, and `CsvImportReport` type/interface declarations (the block that originally read, roughly):

```ts
export interface CsvRowRaw {
  word: string;
  vietnameseMeaning: string;
  partOfSpeech?: string;
  ipa?: string;
  deck?: string;
  tags?: string;
  prefix?: string;
  root?: string;
  suffix?: string;
  exampleSentence?: string;
}

export interface CsvImportConflict {
  word: string;
  field: string;
  existingValue: string;
  importedValue: string;
  resolution: 'keep' | 'use_imported';
}

export interface CsvImportReport {
  newWordsCount: number;
  existingLinkedCount: number;
  emptyFieldsFilledCount: number;
  conflictsResolvedCount: number;
  duplicateRowsRemovedCount: number;
  invalidRowsCount: number;
  rows: CsvRowRaw[];
  conflicts: CsvImportConflict[];
}
```

- [ ] **Step 4: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds (this also runs `lint:vercel-function`, which isn't touched by this plan but confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "chore: delete CSV import in favor of JSON import"
git push origin main
```

---

## Task 10: Manual smoke test in the browser

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server and open the app**

Use the `run` skill or `npm run dev`, then navigate to the app, log in, and click the "Import JSON" nav item.

- [ ] **Step 2: Exercise the golden path**

Click "Phân tích JSON" on the pre-filled sample (creates a new "IELTS" deck and "daily" tag). Confirm the Preview table shows the sample word with "sẽ tạo mới" next to the deck and tag. Click "Xác nhận Import". Confirm the Summary screen shows `Tạo mới: 1`. Click "Đóng cửa sổ" and confirm the word now appears in the vocabulary library with the new deck/tag attached (not silently dropped).

- [ ] **Step 3: Exercise an edge case**

Paste a JSON array with one entry missing `word` and one entry that duplicates an existing word's `word` + first `part_of_speech`. Confirm the Preview step lists the invalid entry's error and the duplicate count, and that only the valid, non-duplicate entries import.

- [ ] **Step 4: Report findings**

If anything in the smoke test doesn't match the spec (`docs/superpowers/specs/2026-08-04-json-word-import-design.md`), fix it before considering this plan complete — this is the final gate, not a nice-to-have.
