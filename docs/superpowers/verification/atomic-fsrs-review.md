# Atomic FSRS Review Verification

Date: 2026-08-03

Automated checks:

- `npm test -- --run` — PASS (40 files, 196 tests)
- `npm run lint` — PASS
- `npm run build` — PASS

Implemented database checks for Supabase execution:

- Development review history reset migration.
- FSRS consistency normalization.
- `review_events` RLS and unique idempotency key.
- `submit_learning_review` RPC presence and transaction boundary.

Manual Supabase checks still required after applying migrations:

1. Submit a correct answer and verify one attempt plus one FSRS card update.
2. Repeat the same request with the same idempotency key and verify no duplicate attempt.
3. Submit an invalid or unowned session/card and verify both writes roll back.
4. Confirm vocabulary and learning-card content remain after the development reset.
