# Analytics Correction and Memory Dashboard Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Progress and Memory Analytics accurate, FSRS-driven, timezone-correct, and updated immediately after learning.

**Architecture:** Persisted FSRS cards are the source for current memory state; authenticated `study_attempts` are the source for observed performance. A pure analytics reducer receives the active Study Scope and attempt rows, then produces dashboard metrics, activity buckets, and per-card rows. App keeps a local attempt buffer for instant post-session updates and hydrates the same rows from Supabase on load.

**Tech Stack:** React + TypeScript, Supabase repository, Vitest, existing `getStudyDate` and FSRS state types.

## Global Constraints

- Scope every metric to active words in the current Study Scope.
- Use `fsrs_state` as the authoritative learning status.
- Use `fsrs_retrievability` for predicted memory; do not average legacy `firstAttemptErrorRate` for retention.
- Use `study_attempts` for observed accuracy, retries, hints, reveal rate, and response time.
- Convert activity timestamps using `Asia/Ho_Chi_Minh` and the existing 04:00 study-day boundary.
- Do not change FSRS scheduling or mutate historical attempts.
- Preserve the current learner navigation and sentence analytics section.

---

### Task 1: Add a pure analytics reducer and tests

**Files:**
- Create: `src/features/analytics/progressAnalytics.ts`
- Create: `src/features/analytics/progressAnalytics.test.ts`

**Interfaces:**

```ts
export type ProgressAttemptRow = {
  learning_card_id: string;
  is_correct: boolean;
  first_attempt: boolean;
  response_time_ms: number | null;
  hint_level: number;
  answer_revealed: boolean;
  created_at: string;
};

export type ProgressAnalytics = {
  totalCards: number;
  stateCounts: {new: number; learning: number; review: number; relearning: number};
  predictedRetention: number | null;
  firstAttemptAccuracy: number | null;
  overallAccuracy: number | null;
  retryRate: number | null;
  hintRate: number | null;
  revealRate: number | null;
  averageResponseTimeMs: number | null;
  activity: Array<{studyDate: string; attempts: number; firstAttemptCorrect: number; minutes: number}>;
  cards: Array<{cardId: string; fsrsState: number; predictedRetention: number | null; attempts: number; firstAttemptAccuracy: number | null}>;
};

export function calculateProgressAnalytics(
  words: Word[],
  attempts: ProgressAttemptRow[],
  now: Date,
  timezone?: string,
): ProgressAnalytics;
```

- [ ] Write failing tests for Study Scope filtering, FSRS state counts, excluding new cards from predicted retention, first-attempt/overall accuracy, retries, hints, reveals, response-time average, 7 local study-day buckets, and per-card metrics.
- [ ] Run the focused test and verify it fails because the reducer does not exist.
- [ ] Implement the reducer with no UI or Supabase dependencies. Use `getStudyDate` for activity buckets and return `null` rather than fake `100%` when there are no observations.
- [ ] Run focused tests until green.
- [ ] Commit: `feat: add source-of-truth progress analytics`.

### Task 2: Load all authenticated attempt telemetry

**Files:**
- Modify: `src/features/analytics/sentenceAnalytics.ts` to reuse the shared attempt row shape.
- Modify: `src/features/persistence/sessionRepository.ts` to add `getStudyAttemptAnalytics(userId)` selecting the authenticated user’s attempt telemetry.
- Modify: `src/features/persistence/sessionRepository.test.ts`.

- [ ] Add a failing repository test proving the query selects all attempts for the current user and returns an empty array safely.
- [ ] Implement the repository function; keep `getSentenceAttemptAnalytics` as a compatibility wrapper/filter over the same row loader.
- [ ] Run the repository tests and commit: `feat: load authenticated study analytics`.

### Task 3: Keep analytics current in App state

**Files:**
- Modify: `src/App.tsx` hydration and `handleAttempt` paths.
- Modify: `src/components/ProgressView.tsx` props.
- Modify: `src/App.test.tsx` if needed for post-attempt state updates.

- [ ] Add a failing test for appending a newly submitted attempt without a page refresh.
- [ ] Hydrate all attempt rows once per authenticated user, append each successful local attempt immediately with `created_at: new Date().toISOString()`, and pass rows plus `words`/`studyScope` to ProgressView.
- [ ] Recompute sentence analytics from the same rows so sentence and aggregate metrics cannot disagree.
- [ ] Run App and sentence analytics tests and commit: `feat: refresh progress analytics after study`.

### Task 4: Replace incorrect Progress UI metrics

**Files:**
- Modify: `src/components/ProgressView.tsx`.
- Create or modify: `src/components/ProgressView.test.tsx`.

- [ ] Add failing UI tests for correct FSRS state counts, predicted retention, observed accuracy, null empty states, and exclusion of paused/out-of-scope words.
- [ ] Replace legacy `memoryStrength`/`firstAttemptErrorRate` calculations with Task 1 output. Show labels: `Khả năng nhớ dự đoán`, `Đúng lần đầu`, `Độ chính xác tổng`, `Tỷ lệ retry`, `Dùng hint`, and `Reveal đáp án`.
- [x] Move per-card FSRS status, predicted retention, attempts, first-attempt accuracy, last review, and next review into the Vocabulary Library word-detail popup; keep Progress focused on aggregate analytics.
- [ ] Keep sentence analytics and activity sections, but render activity from the reducer’s local study-date buckets.
- [ ] Run focused UI tests and commit: `feat: correct memory analytics dashboard`.

### Task 5: Full verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-phase-3-fsrs-design.md` with the analytics contract.

- [ ] Verify a new card displays `Mới` and no predicted retention, never `Critical` solely because its score is zero.
- [ ] Verify a reviewed card’s retention follows `fsrs_retrievability`, while observed accuracy follows `study_attempts`.
- [ ] Verify 04:00 local boundary and no UTC day shift.
- [ ] Run `npm test -- --run`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Commit: `docs: document analytics source of truth` and push `main`.
