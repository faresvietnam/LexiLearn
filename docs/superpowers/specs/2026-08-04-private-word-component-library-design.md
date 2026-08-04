# Private Word Component Library and Atomic Save Design

## Goal

Allow every learner to maintain a private, reusable library of all word
structure components (`prefix`, `root`, `base`, `suffix`, `combining_form`,
and `compound_component`) while fixing the 403 failure that prevents private
words from being saved.

## Confirmed Root Cause

The application inserts a new `private_words` row with `status = 'approved'`.
The deployed database still has the historical
`owners insert pending private meanings` RLS policy, which only permits a
`private_meanings` insert when its parent word has `status = 'pending'`.

The observed API sequence is therefore:

1. `POST private_words` returns 201.
2. `POST private_meanings` returns 403.
3. The client deletes the incomplete parent word as cleanup.

The deployed grants are sufficient. The failure is caused by the stale RLS
policy rather than a missing table grant.

## Data Model

Create `public.private_word_components` with:

- `id uuid primary key`
- `owner_user_id uuid not null references public.users(id) on delete cascade`
- `type text not null`, constrained to the existing supported component types
- `normalized_text text not null`
- `display_text text not null`
- `meaning text`
- timestamps
- a unique constraint on `(owner_user_id, type, normalized_text)`

Add a required `component_id` foreign key to `private_word_parts`. A word part
remains the ordered association between a private word and a reusable
component. It retains `text`, `type`, and `meaning` as a compatibility
snapshot so existing readers and the current `WordPart` UI type do not need a
coordinated rewrite.

Existing `private_word_parts` rows are backfilled into per-user components and
linked before `component_id` becomes required.

## Normalization and Reuse

Component lookup is scoped to one authenticated user and one component type.
Normalization:

1. Trim surrounding whitespace.
2. Convert to lowercase.
3. Remove leading and trailing hyphens used only as boundary notation.
4. Trim again.

For example, `com-` normalizes to `com`, `-ent` to `ent`, and `pon` remains
`pon`. The original trimmed value remains in `display_text` and in the word
part snapshot.

The same normalized text with different types represents different
components. A `root` named `act` and a `suffix` named `act` do not share an ID.
Two users never share component IDs.

When an existing component is reused, its ID is authoritative. A non-empty
meaning supplied by the current save updates an empty stored meaning but does
not silently overwrite an existing non-empty meaning. The word part snapshot
retains the meaning entered for that word.

## Atomic Save Flow

Replace the browser's multi-request private-word creation sequence with one
`security invoker` database RPC. The RPC:

1. Requires `auth.uid()` and rejects a mismatched caller-provided owner.
2. Validates that the word has at least one meaning.
3. Inserts the approved private word.
4. Inserts its private meanings.
5. Upserts each component on
   `(owner_user_id, type, normalized_text)` and inserts ordered word-part
   associations using the resulting IDs.
6. Inserts examples, personal vocabulary metadata, tags, and learning cards.
7. Returns the persisted IDs and rows needed by the repository mapper.

Postgres transaction semantics make the call all-or-nothing. No client-side
compensating delete is required when an intermediate insert fails.

The RPC does not use `security definer` and does not bypass RLS. Execute access
is revoked from `public` and `anon` and granted only to `authenticated`.

## Authorization

Enable RLS on `private_word_components`.

Authenticated users can select, insert, and update only rows where
`owner_user_id = auth.uid()`. Components are not shared or discoverable across
users. Deletion is not exposed in this change because removing an in-use
component would break word-part associations; unused-component cleanup is
outside the requested scope.

Replace all obsolete `pending` private-meaning policies with policies based on
ownership of the parent private word. The policies support the active
`approved` lifecycle and use `TO authenticated`.

Grant only the table operations required by these policies. Existing RLS on
all exposed tables remains enabled.

## Application Changes

`createPrivateWord` sends a single typed RPC payload containing the word,
meanings, components, examples, deck, tags, and study status. It maps the RPC
response back to the existing `Word` shape so `AddWordModal` and its caller
retain their current interface.

The add-word form replaces its single meaning fields with an ordered list of
meaning sections. Every section contains:

- required Vietnamese meaning
- required part of speech
- optional English definition
- zero or more example sentences belonging to that meaning

The form starts with one meaning section, permits adding and removing
sections, and never permits removing the final section. Submission requires a
non-empty word and requires every remaining meaning section to have a
non-empty Vietnamese meaning and part of speech. Meaning and example order in
the form becomes `display_order` and the returned UI order.

`MeaningCard` gains an optional `definitionEn` property. Private persistence
writes it to `private_meanings.definition_en`, selects it when loading learner
state, and maps it back to `definitionEn`. Global meanings use the same
property when `definition_en` is present so the shared UI model remains
consistent.

An empty IPA input remains absent on the `Word` object and is persisted as
`null`. The application must not synthesize `/${normalizedWord}/`, because
that string is not a verified phonetic transcription.

The generic Vietnamese error remains as a user-facing fallback. Development
logging records the Supabase error code and message without credentials or
personal data, making future permission failures diagnosable.

No component-picker or autocomplete UI is included. Reuse happens
automatically during save, which satisfies the current request without
expanding the interface.

## Migration and Compatibility

The migration:

1. Creates and secures the component library.
2. Adds the nullable foreign key.
3. Backfills existing parts using their owning private word.
4. Verifies every existing part is linked.
5. Makes the foreign key non-null.
6. Replaces stale private-meaning policies.
7. Creates and grants the atomic save RPC.

The repository migration file and the deployed Supabase project must receive
the same SQL. Migration-chain tests must include the new migration.

## Error Handling

- Missing authentication or owner mismatch returns SQLSTATE `42501`.
- Invalid/empty word, meanings, component text, or unsupported component type
  returns SQLSTATE `22023`.
- Duplicate private words retain the existing
  `(owner_user_id, normalized_word)` uniqueness behavior.
- Any database error rolls back every row created by that call.
- The application returns `Không thể lưu từ vựng. Vui lòng thử lại.` and logs
  the structured diagnostic in development.

## Verification

Automated tests cover:

- The historical approved-word/private-meaning policy mismatch.
- Creating a component not yet present in the learner's library.
- Reusing a component for a later word owned by the same learner.
- Keeping identical normalized text separate when component types differ.
- Keeping identical components separate across users.
- Boundary-hyphen and case normalization.
- Preserving a non-empty stored meaning during reuse.
- Rolling back the complete private-word save after invalid input.
- Creating multiple meanings with independent parts of speech, definitions,
  example associations, and stable display order.
- Rejecting submission when any meaning section lacks its required values.
- Persisting and reloading optional English definitions.
- Keeping IPA absent through form creation, persistence, and reload when the
  learner leaves it blank.
- Repository payload mapping and returned `Word` mapping.
- Existing persistence and production build suites.

After deployment, run a real authenticated save and confirm that the API no
longer emits the `POST private_meanings` 403 and that two words using the same
component reference one user-owned component row.
