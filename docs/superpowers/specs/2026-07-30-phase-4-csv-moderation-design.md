# LexiLearn — Phase 4: CSV and Moderation

## Goal

Replace the prototype CSV path with a safe, resumable import pipeline and complete the Admin moderation workflow without overwriting Global content.

## Scope

- Parse CSV with quoted fields, escaped quotes, commas, and newlines.
- Normalize headers and values, validate required fields, and report invalid rows.
- Keep the first canonical duplicate row and report later duplicates without merging them.
- Match Global and Private Words before import.
- Create new words as pending Private Words; link identical Global Words.
- Convert differences against approved Global Words into Edit Suggestions.
- Persist import status and row outcomes so an interrupted import can resume.
- Add transactional approve, reject, merge, Edit & Approve, submission versions, optimistic locking, and Admin audit logs.

## Non-goals

- No direct learner writes to Global Vocabulary.
- No CSV overwrite of approved Global content.
- No adaptive Stage 4, FSRS recalibration, or analytics dashboard work.

## Import statuses

`uploaded → validating → ready → importing → completed | failed`.

## Safety rules

- Duplicate key uses normalized spelling plus lexical type; punctuation and whitespace are normalized, but homographs with different lexical types remain reviewable.
- A row is only persisted after validation and ownership checks.
- Every Admin mutation checks the current `submission_version` and records an audit event.
- A stale version returns a conflict and cannot overwrite newer moderation work.

