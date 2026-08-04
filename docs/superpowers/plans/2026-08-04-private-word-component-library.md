# Private Word Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix private-word saves, add an owner-isolated reusable component library, and let learners create multiple meanings with optional English definitions and genuinely optional IPA.

**Architecture:** A single `security invoker` Postgres RPC saves the complete private-word graph atomically. It upserts owner-scoped morphology components and links ordered word-part snapshots to them. React owns an ordered meaning-draft editor, while persistence types and mappers carry `definition_en` end to end.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Supabase JS 2.111, PostgreSQL/Supabase RLS.

## Global Constraints

- Component reuse is private to one authenticated user.
- Reuse applies to `prefix`, `root`, `base`, `suffix`, `combining_form`, and `compound_component`.
- Component identity is `(owner_user_id, type, normalized_text)`.
- Normalization trims whitespace, lowercases, and removes boundary hyphens.
- Existing non-empty component meanings are never silently overwritten.
- Private-word creation is one all-or-nothing `security invoker` RPC.
- RLS remains enabled on every exposed learner-owned table.
- The RPC is executable by `authenticated` only, never `public` or `anon`.
- Empty IPA persists as `null`; never synthesize `/${normalizedWord}/`.
- Every meaning requires Vietnamese text and part of speech; English definition is optional.
- No component autocomplete or component-management UI is in scope.

---

## File Structure

- `supabase/migrations/20260804031142_add_private_word_component_library.sql` — schema, backfill, RLS repair, grants, normalization helper, and atomic RPC.
- `supabase/tests/private_word_component_library.sql` — real PostgreSQL behavior tests for isolation, reuse, policy repair, and rollback.
- `supabase/tests/phase_2_migration_chain.test.ts` — asserts the generated migration remains in the replay chain.
- `src/types/index.ts` — adds `MeaningCard.definitionEn`.
- `src/features/persistence/mappers.ts` — selects and maps private/global English definitions.
- `src/features/persistence/vocabularyRepository.ts` — replaces sequential inserts with one RPC payload and maps its response.
- `src/features/persistence/persistence.test.ts` — repository and mapper regression coverage.
- `src/components/AddWordModal.tsx` — ordered meaning editor and optional IPA behavior.
- `src/components/AddWordModal.test.tsx` — observable form behavior for multiple meanings, validation, definitions, examples, and blank IPA.

---

### Task 1: Database migration and behavioral SQL tests

**Files:**
- Create: `supabase/migrations/20260804031142_add_private_word_component_library.sql`
- Create: `supabase/tests/private_word_component_library.sql`
- Modify: `supabase/tests/phase_2_migration_chain.test.ts`

**Interfaces:**
- Consumes: existing `private_words`, `private_meanings`, `private_word_parts`, `private_examples`, `personal_vocabulary`, `personal_word_tags`, and `learning_cards`.
- Produces: `public.private_word_components`, `private_word_parts.component_id`, `private.normalize_word_component(text)`, and `public.create_private_word(jsonb) returns jsonb`.

- [ ] **Step 1: Verify the CLI-generated migration scaffold**

Run:

```bash
test -f supabase/migrations/20260804031142_add_private_word_component_library.sql
```

Expected: exit 0. The scaffold was generated with
`supabase migration new add_private_word_component_library`; do not create a
second migration.

- [ ] **Step 2: Write the failing migration-chain assertion**

Add the generated filename to the exact ordered filename array in
`phase_2_migration_chain.test.ts`.

Run:

```bash
npm test -- supabase/tests/phase_2_migration_chain.test.ts
```

Expected: PASS and the generated filename is protected against accidental
removal from the replay chain. The behavioral RED test is the next step.

- [ ] **Step 3: Write the failing SQL behavior test**

Create a transaction-scoped test that sets authenticated JWT claims for two
fixture users and asserts:

```sql
-- learner A can save an approved word with a meaning
select public.create_private_word(jsonb_build_object(
  'owner_user_id', '00000000-0000-4000-8000-000000000501',
  'word', 'component',
  'ipa', null,
  'study_status', 'active',
  'meanings', jsonb_build_array(jsonb_build_object(
    'meaning_vi', 'thành phần',
    'part_of_speech', 'noun',
    'definition_en', 'one part of a larger whole',
    'examples', '[]'::jsonb
  )),
  'parts', jsonb_build_array(jsonb_build_object(
    'text', 'com-',
    'type', 'prefix',
    'meaning', 'together'
  )),
  'tag_ids', '[]'::jsonb
));

-- a second A-owned word using COM reuses the same prefix component
-- a root named com creates a different component
-- learner B gets a distinct component
-- an invalid second meaning raises and leaves no private_words row
-- deployed obsolete "* pending private meanings" policies no longer exist
```

The test must derive literal expected counts: one A-owned `prefix/com`, one
A-owned `root/com`, and one B-owned `prefix/com`.

Run it with the repository's existing local Supabase SQL-test command. If no
local database is running, start it using the CLI command discovered via
`npx supabase --help`, then execute the SQL file with the same runner used by
the existing `supabase/tests/*.sql` files.

Expected: FAIL because the table/function do not exist and the stale policy is
still represented by the migration chain.

- [ ] **Step 4: Implement the component table and safe backfill**

The migration must create:

```sql
create table public.private_word_components (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'prefix','root','base','suffix','combining_form','compound_component'
  )),
  normalized_text text not null check (normalized_text <> ''),
  display_text text not null check (btrim(display_text) <> ''),
  meaning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, type, normalized_text)
);

create index private_word_components_owner_idx
  on public.private_word_components(owner_user_id);
```

Create an immutable normalization function that applies:

```sql
lower(btrim(btrim(p_text), '-'))
```

Add nullable `private_word_parts.component_id`, index the foreign key, backfill
with `insert ... on conflict ... do update ... returning`, verify no part is
unlinked, then set the column `not null`. Preserve existing `text`, `type`, and
`meaning` columns as snapshots.

- [ ] **Step 5: Implement least-privilege RLS and repair meaning policies**

Enable RLS on `private_word_components`; grant only `select, insert, update`
to `authenticated`. Policies must use:

```sql
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()))
```

Drop both historical and current policy names for private-meaning mutations,
including `owners insert pending private meanings`, then create ownership-only
`select`, `insert`, and `update` policies compatible with approved private
words. Keep deletion governed by parent ownership.

- [ ] **Step 6: Implement the atomic invoker RPC**

Create:

```sql
create or replace function public.create_private_word(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
```

The function must:

1. Require `auth.uid()` and exact `owner_user_id` match.
2. Validate non-empty word and non-empty meanings array.
3. Insert the approved private word.
4. Iterate meanings with ordinality, validate required fields, insert
   `definition_en`, and insert that meaning's examples.
5. Iterate parts with ordinality; atomically upsert components on the unique
   key. `DO UPDATE` may fill `meaning` only when stored meaning is null/empty.
6. Insert part snapshots with returned `component_id`.
7. Insert personal vocabulary, validated owner-scoped tags, and one learning
   card per meaning.
8. Return the exact nested row graph required by `mapVocabularyRow`.

Use `jsonb_agg(... order by display_order)` in the response. Revoke execute
from `public` and `anon`; grant execute to `authenticated`.

- [ ] **Step 7: Verify database behavior**

Run the SQL behavior test and migration-chain test.

Expected: PASS; the rollback assertion leaves zero rows for the invalid word.

- [ ] **Step 8: Commit the database deliverable**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: save private words with reusable components"
```

---

### Task 2: Carry English definitions through application types and mappers

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/features/persistence/mappers.ts`
- Modify: `src/features/persistence/persistence.test.ts`

**Interfaces:**
- Consumes: `private_meanings.definition_en` and `global_meanings.definition_en`.
- Produces: `MeaningCard.definitionEn?: string` and mapping for both word sources.

- [ ] **Step 1: Write failing mapper tests**

Add one private-word and one global-word fixture with:

```ts
definition_en: 'one part of a larger whole'
```

Assert the mapped meaning contains:

```ts
definitionEn: 'one part of a larger whole'
```

Also assert a null definition omits `definitionEn`.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- src/features/persistence/persistence.test.ts
```

Expected: FAIL because `MeaningCard`/mappers do not expose the definition.

- [ ] **Step 3: Implement the minimal type and mapper changes**

Add:

```ts
definitionEn?: string;
```

to `MeaningCard`; add `definition_en: string | null` to both meaning row types;
include it in `VOCABULARY_SELECT`; and conditionally map non-empty values.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/features/persistence/persistence.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/features/persistence/mappers.ts src/features/persistence/persistence.test.ts
git commit -m "feat: persist English meaning definitions"
```

---

### Task 3: Replace sequential repository writes with the atomic RPC

**Files:**
- Modify: `src/features/persistence/vocabularyRepository.ts`
- Modify: `src/features/persistence/persistence.test.ts`

**Interfaces:**
- Consumes: `public.create_private_word(p_payload jsonb)`.
- Produces: unchanged `createPrivateWord(userId: string, word: Word): Promise<PersistenceResult<Word>>`.

- [ ] **Step 1: Write a failing repository contract test**

Mock only the external Supabase RPC boundary. Invoke `createPrivateWord` with
two meanings and assert the observable result contains two mapped meanings,
their independent examples, optional definitions, and no IPA property.

The expected RPC payload must be hand-written:

```ts
{
  owner_user_id: 'user-1',
  word: 'component',
  normalized_word: 'component',
  ipa: null,
  audio_url: null,
  image_url: null,
  image_object_key: null,
  deck_id: 'deck-1',
  study_status: 'active',
  tag_ids: ['tag-1'],
  meanings: [
    {
      meaning_vi: 'thành phần',
      part_of_speech: 'noun',
      definition_en: 'one part of a larger whole',
      examples: [/* exact sentence payload */],
    },
    {
      meaning_vi: 'yếu tố',
      part_of_speech: 'noun',
      definition_en: null,
      examples: [],
    },
  ],
  parts: [/* exact ordered snapshots */],
}
```

Assert only one `rpc('create_private_word', {p_payload: ...})` call occurs and
no direct `.from(...).insert(...)` call occurs.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/features/persistence/persistence.test.ts
```

Expected: FAIL because the repository still performs sequential inserts.

- [ ] **Step 3: Implement the RPC adapter**

Delete `removePrivateWord` and the sequential create flow. Build the payload,
call the RPC once, treat an error or missing graph as `WORD_ERROR`, map the
returned graph through `mapVocabularyRow`, and preserve user-entered
word-structure/example objects only where the returned graph lacks a UI-only
field.

In development only, log:

```ts
console.error('create_private_word failed', {
  code: error.code,
  message: error.message,
});
```

Do not log JWTs, API keys, payload contents, or personal data.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/features/persistence/persistence.test.ts
npm run lint
```

Expected: PASS with exactly one RPC write in the success test.

- [ ] **Step 5: Commit**

```bash
git add src/features/persistence/vocabularyRepository.ts src/features/persistence/persistence.test.ts
git commit -m "refactor: create private words atomically"
```

---

### Task 4: Build the ordered multi-meaning form and remove fake IPA

**Files:**
- Modify: `src/components/AddWordModal.tsx`
- Modify: `src/components/AddWordModal.test.tsx`

**Interfaces:**
- Consumes: `MeaningCard.definitionEn?: string`.
- Produces: a `Word` containing one or more ordered `MeaningCard` values with independently owned examples.

- [ ] **Step 1: Write failing user-behavior tests**

Using accessible labels/buttons, test:

1. The form starts with one meaning.
2. `Thêm nghĩa` creates a second section.
3. Each section accepts its own Vietnamese meaning, part of speech, English
   definition, and examples.
4. Submitting produces two ordered meanings with the exact section values.
5. Removing a section removes only its examples and the last section cannot be
   removed.
6. A blank required field in any section prevents `onAddWord`.
7. Blank IPA produces a `Word` without an `ipa` property.

Name the break caught by each test; do not assert internal state.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/components/AddWordModal.test.tsx
```

Expected: FAIL because the current form has one shared meaning and synthesizes
IPA.

- [ ] **Step 3: Implement a focused meaning draft model**

Replace the scalar meaning/POS/examples state with:

```ts
type MeaningDraft = {
  id: string;
  vietnameseMeaning: string;
  partOfSpeech: string;
  definitionEn: string;
  exampleSentences: string[];
};
```

Keep `word`, `ipa`, components, deck, tags, and image as word-level fields.
Render one bordered section per meaning with stable IDs, `Thêm nghĩa`, and
remove controls. Disable removal when only one section remains.

- [ ] **Step 4: Build the submitted Word without fake values**

Create one `MeaningCard` per validated draft. Each card receives only its own
examples and conditionally includes a trimmed `definitionEn`. Replace:

```ts
ipa: draft.ipa.trim() || `/${normalizedWord}/`,
```

with a conditional property:

```ts
...(draft.ipa.trim() ? {ipa: draft.ipa.trim()} : {}),
```

Do not create a placeholder example when the learner enters none.

- [ ] **Step 5: Adapt Gemini single and batch draft creation**

Map every returned Gemini meaning into a distinct `MeaningDraft`, retaining
its part of speech, initializing `definitionEn` to an empty string, and
associating its examples with that meaning. If Gemini returns no meanings,
retain one empty editable section rather than submitting invalid data.

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- src/components/AddWordModal.test.tsx
npm test -- src/features/gemini/geminiClient.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/AddWordModal.tsx src/components/AddWordModal.test.tsx
git commit -m "feat: add multiple meanings to word entry"
```

---

### Task 5: Full verification and production deployment

**Files:**
- Modify only files required by failures attributable to Tasks 1–4.
- Apply the generated migration to Supabase project `whsyzhsvsmyzdaxqrvoi`.

**Interfaces:**
- Consumes: complete local implementation and migration.
- Produces: verified local build and deployed database behavior.

- [ ] **Step 1: Run the complete local verification suite**

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Review the migration security posture**

Run Supabase security and performance advisors. Confirm:

- RLS enabled on `private_word_components`.
- No anonymous component privileges.
- Owner and foreign-key indexes exist.
- RPC execute is absent for `public`/`anon`.
- RPC is `security invoker`.

- [ ] **Step 3: Apply the migration to the connected project**

Use the Supabase migration tool with the exact reviewed local SQL and migration
name. Do not apply hand-edited SQL that differs from the committed file.

- [ ] **Step 4: Verify deployed schema and policies read-only**

Query `information_schema`, `pg_policies`, and `information_schema.routines`
to confirm the component table, owner policies, repaired private-meaning
policies, and invoker RPC match the migration.

- [ ] **Step 5: Verify the authenticated browser flow**

Save a word with:

- two meanings
- one English definition
- blank IPA
- prefix/root/suffix parts
- one example attached to only the first meaning

Then save a second word using one of the same components. Confirm:

- no `POST private_meanings` 403 appears
- both words persist after reload
- blank IPA remains blank
- meanings/definitions/examples retain their associations
- both word-part rows reference the same owner-scoped component ID

- [ ] **Step 6: Final commit if verification required adjustments**

```bash
git status --short
git commit -m "fix: close private word save verification gaps"
```

Stage only the files shown by `git status --short` that were adjusted to fix
Task 5 verification failures, using explicit paths. Skip this commit when
verification made no code changes.
