# Phase 1 Prototype Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing local React/Vite learning prototype testable and correct without changing its flow or adding Supabase/Vercel infrastructure.

**Architecture:** Vitest validates pure session/SRS/diff rules directly and React Testing Library validates session completion through the real component. `App` remains the owner of words state and receives a narrow meaning-card update callback from `LearningSessionView`. Session mode is explicit at construction time so final statistics do not infer it.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest, jsdom, React Testing Library.

## Global Constraints

- Preserve the current React/Vite navigation and local mock-data flow.
- Do not add Supabase, Vercel, Auth, Gemini, FSRS, or routing work in this phase.
- Production behaviour changes require a failing test first, followed by the smallest passing implementation.
- Use `approvalStatus === 'pending'` as the prototype definition of a newly learned private word.
- An empty eligible queue must remain empty; do not inject demo cards.

---

## File structure

- `package.json`: test commands and development test dependencies.
- `vite.config.ts`: Vitest jsdom configuration.
- `src/test/setup.ts`: DOM matcher setup.
- `src/utils/sessionBuilder.ts`: remove fallback and reuse spacing for all queues.
- `src/utils/*.test.ts`: direct behavioural tests for session builder, SRS and character diff.
- `src/components/LearningSessionView.tsx`: explicit session mode, elapsed-time/statistics correctness, current-attempt diff, accumulated errors, callback for card update.
- `src/components/LearningSessionView.test.tsx`: component-level session completion regression tests.
- `src/App.tsx`: own/update meaning-card state and pass session mode/callback.

### Task 1: Establish the test harness and pure-utility regression suite

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/test/setup.ts`, `src/utils/charDiff.test.ts`, `src/utils/srs.test.ts`, `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Consumes: existing `computeCharDiff`, `evaluateSrsAttempt`, `buildSessionQuestions`.
- Produces: `npm test -- --run` that discovers `src/**/*.test.ts?(x)` in jsdom.

- [x] **Step 1: Write failing utility tests**

Create fixtures with active/paused words, decks, tags, meaning cards and dates. Assert `buildSessionQuestions` returns `[]` when no new/due card exists, extra review excludes strong cards, and adjacent questions do not share a word when an alternative exists. Assert CharDiff detects missing and transposed characters. Assert SRS appends history and resets an incorrect card to a one-day interval.

- [x] **Step 2: Run the utility test command and verify RED**

Run: `npm test -- --run src/utils`

Expected: test command is unavailable or session-builder tests fail because the demo fallback/extra-review spacing violates the assertions.

- [x] **Step 3: Add minimal test configuration and session-builder implementation**

Add Vitest, jsdom, Testing Library dependencies and test scripts. Configure `test.environment = 'jsdom'` in `vite.config.ts`. Remove the demo fallback. Send the extra-review selection through `enforceWordSpacing` before converting it to questions.

- [x] **Step 4: Run the utility suite and verify GREEN**

Run: `npm test -- --run src/utils`

Expected: PASS.

### Task 2: Make SRS updates and session stats explicit in the component API

**Files:**
- Modify: `src/components/LearningSessionView.tsx`, `src/App.tsx`
- Create: `src/components/LearningSessionView.test.tsx`

**Interfaces:**
- Add to `LearningSessionViewProps`: `isExtraReview: boolean` and `onMeaningCardUpdated: (wordId: string, meaningCardId: string, updatedCard: MeaningCard) => void`.
- `App.handleStartLearning(isExtraReview)` stores both questions and mode; `App` updates only the matching card immutably.

- [x] **Step 1: Write failing component tests**

Render a one-question pending-word session with fake time. Submit a wrong typed answer, retry correctly, continue, and assert: updated card history includes the first-attempt failure/error type; stats have `firstAttemptAccuracy: 0`, `newWordsLearned: 1`, one retry, full-session time, and the supplied extra-review flag. Add a one-question first-try test to prove the final question contributes 100% accuracy.

- [x] **Step 2: Run the component test command and verify RED**

Run: `npm test -- --run src/components/LearningSessionView.test.tsx`

Expected: FAIL because the component does not expose the update callback, uses stale `diffResult`, counts `draft`, measures only the last question, and hard-codes extra-review false.

- [x] **Step 3: Implement the minimal component and App changes**

Compute the current diff in a local variable, append its `errorTypes` to question-local accumulated errors on failed attempts, and pass accumulated errors to SRS on success. Call `onMeaningCardUpdated` with `result.updatedCard`. Track session start with a ref. Compute final accuracy with current values so the final answer is counted. Pass session mode from `App` and return it in final stats.

- [x] **Step 4: Run the component suite and verify GREEN**

Run: `npm test -- --run src/components/LearningSessionView.test.tsx`

Expected: PASS.

### Task 3: Run the full quality gate and record Phase 1 boundary

**Files:**
- Modify: `lexilearn-complete-system-spec.md` only if it lacks a link to this approved Phase 1 spec.

- [x] **Step 1: Run all tests**

Run: `npm test -- --run`

Expected: PASS.

- [x] **Step 2: Run type and production build checks**

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [x] **Step 3: Verify scope manually**

Inspect `git diff` or changed-file list. Confirm no Supabase client, Vercel configuration/function, FSRS package, or navigation redesign was introduced.
