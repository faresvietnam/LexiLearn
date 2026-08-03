# FSRS Atomic Review Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the development database to a clean FSRS baseline and persist each review attempt plus its new card schedule atomically.

**Architecture:** Existing vocabulary and learning cards are preserved. Development-only review history is removed, inconsistent FSRS cards are normalized, and a Supabase PostgreSQL function becomes the single write boundary for a review. The browser continues calculating the next schedule with `ts-fsrs`; Supabase validates ownership, prevents duplicate submissions, writes the attempt(s), and updates the card in one transaction.

**Tech Stack:** React + TypeScript, Supabase PostgreSQL/RLS, `@supabase/supabase-js`, `ts-fsrs`, Vitest.

## Global Constraints

- This is a development migration; existing `study_attempts` and `study_sessions` may be deleted.
- Preserve vocabulary, meanings, morphology, images, decks, tags, and learning-card rows.
- Do not expose the Supabase service-role key to the browser.
- The client must only submit rows for the authenticated user and an owned session/card.
- A failed review write must not change either `study_attempts` or `learning_cards`.
- A retry of the same review must not create duplicate attempts or advance FSRS twice.
- Production continues using Vercel Functions; no long-running Express process is introduced.

## Current inconsistency being removed

`src/App.tsx` currently writes `study_attempts` through `recordStudyAttempt()` and writes the FSRS card through `updateLearningCardSchedule()` as separate operations. The schedule update is launched without awaiting completion, so a successful attempt can coexist with an old card schedule after a network or database failure.

## Data reset policy

The migration will delete development-only review history:

```sql
delete from public.study_attempts;
delete from public.study_sessions;
```

It will preserve all vocabulary and card content, then normalize every card:

- `fsrs_state = 0`: clear `last_reviewed_at` and `next_review_at`, reset FSRS counters and scores.
- `fsrs_state > 0` with a valid `last_reviewed_at`: preserve the existing FSRS schedule.
- Any other inconsistent card: reset to the New state.

### Task 1: Add development reset and review-event schema

**Files:**
- Create: `supabase/migrations/20260803090000_reset_dev_review_history.sql`
- Create: `supabase/migrations/20260803090100_add_review_idempotency.sql`
- Test: `supabase/tests/phase_3_atomic_review.sql`

**Interfaces:**
- Produces table `public.review_events` with `idempotency_key`, `user_id`, `session_id`, `learning_card_id`, and timestamps.
- Produces a unique constraint on `(user_id, idempotency_key)`.

- [ ] **Step 1: Write the SQL verification test**

  Assert that the reset migration removes review rows, preserves vocabulary rows, normalizes invalid cards, enables RLS on `review_events`, and enforces the unique idempotency key.

- [ ] **Step 2: Add the reset migration**

  Delete only `study_attempts` and `study_sessions`. Normalize inconsistent `learning_cards` using the FSRS rules above. Do not delete vocabulary, meanings, images, decks, tags, or cards.

- [ ] **Step 3: Add `review_events`**

  Create an owner-scoped table with a unique `(user_id, idempotency_key)` constraint and owner insert/select policies. Grant access only to `authenticated`.

- [ ] **Step 4: Run the SQL verification**

  Run the repository Supabase SQL test suite and verify the new assertions pass.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations supabase/tests/phase_3_atomic_review.sql
  git commit -m "feat: reset dev review history for atomic FSRS writes"
  ```

### Task 2: Create the atomic Supabase RPC

**Files:**
- Create: `supabase/migrations/20260803090200_add_submit_learning_review_rpc.sql`
- Modify: `supabase/tests/phase_3_atomic_review.sql`

**Interface:**

```sql
public.submit_learning_review(
  p_session_id uuid,
  p_learning_card_id uuid,
  p_idempotency_key text,
  p_attempts jsonb,
  p_schedule jsonb
) returns jsonb
```

- [ ] **Step 1: Add RPC failure tests**

  Test that an unowned session/card, malformed payload, or invalid schedule raises an error and leaves both tables unchanged.

- [ ] **Step 2: Add RPC success path**

  In one PostgreSQL function transaction:

  1. Resolve the caller with `auth.uid()`.
  2. Lock and verify the owned active session and learning card.
  3. Insert the idempotency event; if it already exists, return the previous result without inserting again.
  4. Insert every attempt from `p_attempts` with the authenticated `user_id` and session ID.
  5. Update the owned `learning_cards` row with the supplied FSRS schedule.
  6. Return the updated card schedule and inserted event ID.

- [ ] **Step 3: Validate payloads**

  Require a non-empty idempotency key, matching card IDs in every attempt, valid question types, non-negative response times, and FSRS state values `0..3`.

- [ ] **Step 4: Run SQL tests**

  Verify success, rollback, ownership, and duplicate retry behavior.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20260803090200_add_submit_learning_review_rpc.sql supabase/tests/phase_3_atomic_review.sql
  git commit -m "feat: add atomic learning review RPC"
  ```

### Task 3: Replace the client persistence boundary

**Files:**
- Modify: `src/features/persistence/sessionRepository.ts`
- Modify: `src/App.tsx`
- Test: `src/features/persistence/sessionRepository.test.ts`
- Test: `src/App.test.tsx`

**Interface:**

```ts
submitLearningReview(input: {
  userId: string;
  sessionId: string;
  learningCardId: string;
  idempotencyKey: string;
  attempts: StudyAttemptInput[];
  schedule: LearningCardScheduleUpdate;
}): Promise<PersistenceResult<LearningCardFsrsRow>>
```

- [ ] **Step 1: Write failing repository tests**

  Mock `.rpc()` and assert the repository sends one RPC call, returns the updated schedule, and surfaces errors without pretending the write succeeded.

- [ ] **Step 2: Implement `submitLearningReview`**

  Call only `client.rpc('submit_learning_review', ...)`. Convert the TypeScript attempt and schedule objects into the RPC JSON shape.

- [ ] **Step 3: Change App review flow**

  Stop calling `recordStudyAttempt()` and `updateLearningCardSchedule()` independently for the same completed review. Build the attempt array and calculated schedule, await `submitLearningReview`, and update local React state only after success.

- [ ] **Step 4: Add retry behavior**

  On failure, keep the current question/card active, show a retry message, and reuse the same idempotency key rather than generating a new submission.

- [ ] **Step 5: Run tests, typecheck, and build**

  ```bash
  npm test -- --run
  npm run lint
  npm run build
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/App.tsx src/features/persistence/sessionRepository.ts src/features/persistence/sessionRepository.test.ts src/App.test.tsx
  git commit -m "feat: persist reviews atomically from the client"
  ```

### Task 4: Verify migration and reset behavior

**Files:**
- Modify: `docs/production-readiness.md`
- Create: `docs/superpowers/verification/atomic-fsrs-review.md`

- [ ] **Step 1: Run the complete automated suite**

  Run tests, typecheck, and production build. Record the command and result in the verification document.

- [ ] **Step 2: Perform the browser smoke test**

  Verify one successful review, one failed review, a network retry, and a duplicate submit. Confirm exactly one logical attempt and one FSRS update are present.

- [ ] **Step 3: Verify rollback**

  Force an RPC validation failure and confirm that no attempt is inserted and the card schedule is unchanged.

- [ ] **Step 4: Commit verification evidence**

  ```bash
  git add docs/production-readiness.md docs/superpowers/verification/atomic-fsrs-review.md
  git commit -m "test: verify atomic FSRS review migration"
  ```

## Acceptance criteria

- Existing vocabulary content remains intact after migration.
- Development review history is intentionally reset.
- One review submission changes `study_attempts` and `learning_cards` together or changes neither.
- Duplicate retries do not create duplicate attempts or advance FSRS twice.
- Unauthorized users cannot submit reviews for another user’s session/card.
- The UI does not advance past a card until the atomic write succeeds.
- `npm test -- --run`, `npm run lint`, and `npm run build` pass.

## Out of scope

- Reconstructing exact FSRS history from deleted legacy attempts.
- Adding offline-first synchronization.
- Moving FSRS calculation from the browser into PostgreSQL.
- Production data migration for real users.
