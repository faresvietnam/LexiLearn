# LexiLearn — Phase 4: CSV persistence and private vocabulary

## Goal

Persist CSV imports safely while keeping the learner flow simple: new vocabulary belongs to the importing user, is immediately studyable, and never requires an approval queue.

## Scope

- Parse CSV with quoted fields, escaped quotes, commas, and newlines.
- Normalize headers and values, validate required fields, and report invalid rows.
- Keep the first canonical duplicate row and report later duplicates without merging them.
- Match Global and Private Words before import.
- Link an exact Global match; otherwise create an approved Private Word owned by the current user.
- Persist import status and row outcomes so an interrupted import can resume.
- Keep FSRS state as the only source of learning status (`0 = Mới`, `1 = Đang học`, `2 = Review`, `3 = Học lại`).

## Non-goals

- Learners never write to Global Vocabulary.
- CSV never overwrites approved Global content.
- No approval, rejection, merge, edit-suggestion, submission-version, or moderation-audit workflow.

## Import statuses

`uploaded → validating → ready → importing → completed | failed`.

## Compatibility note

The legacy `private_word_submissions`, `edit_suggestions`, and moderation RPC/migrations remain in Supabase history for migration replay and old-environment compatibility. The application no longer reads or writes them. Existing private rows are normalized to `approved`; `approved` and `archived` are the only active private-word statuses.
