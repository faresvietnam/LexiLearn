# AI Canonical Word and Three Examples Design

## Goal

Improve AI-assisted vocabulary entry so inflected English input is analyzed
and saved under its dictionary headword, while every generated meaning has
exactly three examples and the correct-answer review popup displays all of
them.

Manual vocabulary entry remains unchanged.

## Scope

Canonicalization applies only to:

- `AI Auto-Fill` for one word.
- `AI thêm danh sách` for batch AI entry.

Canonicalization does not apply when the user fills the form manually and
saves it without invoking AI.

## Canonical Word Rules

Gemini returns a required `canonicalWord` representing the dictionary
headword used for all generated fields.

AI converts:

- Past tense and past participles to the base verb.
- `-ing` verb forms to the base verb.
- Plural nouns to the singular dictionary headword, including irregular
  plurals.

AI preserves:

- Comparative and superlative forms.
- Words whose dictionary headword happens to resemble an inflected form.

Examples:

- `abandoned` becomes `abandon`.
- `written` becomes `write`.
- `running` becomes `run`.
- `children` becomes `child`.
- `better`, `larger`, and `largest` remain unchanged.
- `news` remains `news`.

After a successful single-word AI response, the visible English-word input is
updated to `canonicalWord`. IPA, meanings, definitions, word structure, word
family, and examples must describe that canonical word.

For batch AI entry, each saved word uses its returned `canonicalWord`.

## Meanings and Examples

Gemini returns at most one meaning entry per part of speech. If the model
returns duplicate entries for a part of speech, the client merges them using
the existing defensive grouping behavior.

Every final meaning entry must contain exactly three distinct, natural English
example sentences. The response schema requires three items. Client validation
rejects a response that has fewer or more than three examples, or duplicate
sentences within a meaning.

When duplicate part-of-speech entries are merged defensively, examples are
deduplicated and the first three distinct examples are retained. If merging
still produces fewer than three distinct examples, the response is invalid.

## Correct-Answer Review Popup

The `Chính xác!` overlay displays every meaning of the current word. Each
meaning section includes:

- Vietnamese meaning.
- Part of speech.
- English definition when present.
- All three example sentences.

The popup uses a bounded viewport height with vertical scrolling so words with
multiple meanings do not overflow the screen. The continue action remains
accessible.

## Data Flow

1. User enters a word and invokes a single or batch AI action.
2. Gemini receives explicit canonicalization rules and a structured response
   schema.
3. The Gemini client validates `canonicalWord`, meanings, and exactly three
   unique examples per meaning.
4. The client validates morphology against `canonicalWord`, not the original
   inflected input.
5. Single AI Auto-Fill updates the visible word input and fills the form.
6. Batch AI entry builds and saves each word from its canonical result.
7. Manual entry bypasses all canonical-word logic.
8. During study, the correct-answer popup reads the persisted examples and
   renders all three under every meaning.

## Error Handling

- Missing or invalid `canonicalWord` makes the AI response invalid.
- A meaning without exactly three distinct examples makes the AI response
  invalid.
- Invalid responses show the existing manual-entry feedback and do not replace
  the user's current form values.
- Batch processing reports the affected input word as failed and continues
  with other entries using the existing batch behavior.

## Testing

Add regression coverage for:

- Single AI Auto-Fill changes `abandoned` to `abandon`.
- Batch AI entry saves the returned canonical word.
- Past participle, `-ing`, and plural examples are represented in the prompt
  contract.
- Comparative and superlative forms are explicitly preserved in the prompt.
- Manual save preserves the user-entered word.
- Gemini responses with fewer than three, more than three, or duplicate
  examples are rejected.
- Duplicate parts of speech merge to one meaning with exactly three distinct
  examples.
- The correct-answer overlay renders every meaning and all three examples for
  each meaning.
- The popup remains usable with multiple meaning sections.

