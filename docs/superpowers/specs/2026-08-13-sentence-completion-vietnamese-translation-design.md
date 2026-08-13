# Sentence-Completion Vietnamese Translation Design

## Goal

The `sentence_completion` word-review question (fill the blank in an example
sentence — one of the vocabulary-review question types, distinct from the
separate Sentence Cards feature) currently shows only the masked English
sentence, with no Vietnamese context at all — the one question type where
`meaningCard.meaning` isn't surfaced anywhere. Add a persisted
`sentenceVi` (Vietnamese translation of the whole example sentence, not the
word's meaning) to `ExampleSentence`, generate it at creation time across all
three word-creation flows, backfill the ~304 existing rows once, and display
it under the masked sentence during review.

## 1. Data model & scope

Add `sentenceVi?: string` to `ExampleSentence` (`src/types/index.ts`) —
optional, since existing rows and manually-typed sentences may lack it.

DB: add a nullable `sentence_vi text` column to `private_examples` (304
existing rows, 2 owners). `global_examples` (currently 0 rows) already has
this column from the original schema migration — the app just never wired
it up on either side.

**Explicitly out of scope:** the "Chỉnh sửa" (edit) form in
`WordDetailModal.tsx`. Its `onSaveWord` handler only updates local React
state (`setWords`) — it never calls a persistence function, so the edit
screen doesn't actually save any field to Supabase today. This is a
pre-existing gap unrelated to this feature; adding a `sentenceVi` input
there would silently do nothing, so it's left untouched.

## 2. Persistence — single write path

All three creation flows (JSON import, Gemini single-word analyze, manual
entry) converge on `createPrivateWord()` in
`src/features/persistence/vocabularyRepository.ts`, which calls the RPC
`create_private_word(p_payload jsonb)`. One write path to change:

- New migration:
  - `alter table private_examples add column sentence_vi text;`
  - `alter table global_examples add column sentence_vi text;`
  - `create or replace function public.create_private_word` — insert
    `sentence_vi` into `private_examples`, sourced from
    `nullif(btrim(v_example->>'sentence_vi'), '')` (nullable, same pattern
    as `word_form`/`difficulty`).
- `vocabularyRepository.ts`: add `sentence_vi: example.sentenceVi?.trim() ||
  null` to the `examples` mapping inside `pPayload`.

Read path (`src/features/persistence/mappers.ts` +
`vocabularyRepository.ts`):

- `GlobalExampleRow` / `PrivateExampleRow` types gain `sentence_vi: string |
  null`.
- The two `select` column lists in `vocabularyRepository.ts` (global read,
  private read) add `sentence_vi`.
- Mapping into `ExampleSentence` sets `sentenceVi: example.sentence_vi ??
  undefined`.

## 3. Three creation flows

**JSON import (`JsonImportModal.tsx` copy-paste AI prompt):**

- `buildJsonPrompt` / `SAMPLE_JSON`: each example gains a `"sentence_vi"`
  field — instructed as a natural translation of *that exact sentence*, not
  the word's meaning.
- `types/index.ts`: `JsonWordExampleInput.sentence_vi?: string`.
- `jsonImportParser.ts`: parse it as optional, same pattern as
  `expected_answer`.
- `jsonWordBuilder.ts`: map `example.sentence_vi` → `sentenceVi`.

**Gemini "Phân tích AI" single-word flow (`geminiClient.ts`):**

- `GeminiWordAnalysis.meanings[].examples[]` gains `sentenceVi: string`.
- `RESPONSE_SCHEMA.../examples.items.properties` gains `sentenceVi`
  (**required** — this flow already enforces a strict JSON schema, unlike
  the copy-paste JSON import).
- `buildPrompt`: add an instruction to translate each example sentence
  naturally into Vietnamese.
- `isExample` validator: require `isNonEmptyString(value.sentenceVi)`.
- `parseAnalysis`: map `sentenceVi` through into the parsed result.
- `AddWordModal.tsx` `draftFromGemini`: carries `sentenceVi` from the
  Gemini response into the draft (no retyping needed).

**Manual entry (`AddWordModal.tsx`):**

- Draft shape changes: `meaning.exampleSentences` goes from `string[]` to
  `{sentence: string; sentenceVi: string}[]`. Updates `emptyMeaningDraft`,
  the add/edit/remove handlers, and `createWordFromDraft`'s mapping
  (`sentenceVi: sentenceVi.trim() || undefined`).
- UI: a second, smaller optional textarea "Bản dịch tiếng Việt (tuỳ chọn)"
  under each English example-sentence textarea.

## 4. Display

`LearningSessionView.tsx`, the `sentence_completion` "Context Display"
block (~line 598): add a line below the masked English sentence showing
`currentQuestion.exampleSentence.sentenceVi` when present, styled as
secondary text (`text-sm text-slate-500`, consistent with how other
question types surface `meaningCard.meaning`). Render nothing extra when
absent (old data, or a manually-entered sentence that skipped the
translation field) — no placeholder, no loading state.

## 5. Backfill

304 existing `private_examples` rows (2 owners) lack `sentence_vi`.
`global_examples` has 0 rows — nothing to backfill there.

Done as a one-time direct SQL data fix during plan execution (translate
each sentence, run batched `UPDATE private_examples SET sentence_vi = ...
WHERE id = ...` via the Supabase MCP) — not a persisted in-app feature.
Once the write path above ships, every new sentence gets a translation at
creation time, so there's no recurring "missing translations" case to build
tooling for.

## 6. Testing

- `jsonImportParser.test.ts` — optional `sentence_vi` parses through;
  absent when omitted.
- `jsonWordBuilder.test.ts` — maps `sentence_vi` → `sentenceVi`.
- `geminiClient.test.ts` — schema/validator requires `sentenceVi`; parsed
  result carries it.
- `AddWordModal.test.tsx` — manual Vietnamese-translation field saves into
  the built `Word`; `draftFromGemini` carries `sentenceVi` through without
  requiring re-entry.
- `LearningSessionView.test.tsx` — sentence_completion question shows the
  translation line when present, omits it when absent.
