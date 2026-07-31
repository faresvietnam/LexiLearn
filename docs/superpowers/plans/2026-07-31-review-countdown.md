# Review Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard’s static “Thời gian ước tính” metric with a live countdown to the earliest next review scheduled by FSRS.

**Architecture:** Add a pure scheduling helper that selects the earliest valid future/overdue review from the active Study Scope and formats the remaining time. Dashboard owns a one-minute refresh timer and renders one of three explicit states: due now, countdown, or no scheduled review. FSRS `nextReviewDate`/`next_review_at` remains the source of truth; no estimated session-duration formula remains.

**Tech Stack:** React + TypeScript, Vitest, existing `Word`/`MeaningCard` domain types, `getStudyDate` timezone utility.

## Global Constraints

- Use the user’s IANA timezone from settings/profile where a study-date decision is needed; default remains `Asia/Ho_Chi_Minh`.
- Preserve the existing Dashboard layout and learning flow.
- Do not change FSRS scheduling or write new database fields.
- Keep the existing 04:00 local study-day boundary for daily counters; countdown uses the absolute FSRS timestamp.
- Do not treat `fsrsState = 0` cards as scheduled reviews.
- Never show a negative countdown; overdue cards render “Đã đến lúc ôn”.

---

### Task 1: Define and test next-review selection

**Files:**
- Create: `src/features/scheduling/reviewCountdown.ts`
- Create: `src/features/scheduling/reviewCountdown.test.ts`
- Modify: `src/types/index.ts` only if the helper needs an existing timezone/settings type (prefer no type change).

**Interfaces:**
- Consumes: `Word[]`, active-scope-filtered cards, current `Date`.
- Produces:
  ```ts
  export type ReviewCountdownState =
    | {kind: 'due'}
    | {kind: 'scheduled'; target: Date; remainingMs: number}
    | {kind: 'none'};

  export function findNextReview(
    words: Word[],
    now: Date,
    timezone?: string,
  ): ReviewCountdownState;

  export function formatReviewCountdown(
    state: ReviewCountdownState,
  ): string;
  ```

- [ ] **Step 1: Write failing tests** for: ignore inactive/non-scope words supplied by the caller only through the input list; ignore `fsrsState === 0`; ignore null/invalid dates; return the earliest future timestamp; return `due` when any valid scheduled card is at or before `now`; return `none` when no scheduled card exists; format `45m`, `2h 10m`, `1d 3h`, and `Đã đến lúc ôn`.
- [ ] **Step 2: Run the focused test** — `npm test -- --run src/features/scheduling/reviewCountdown.test.ts`; expected initial failure because the helper does not exist.
- [ ] **Step 3: Implement the minimal pure helper** using `Date.parse`, `fsrsState !== 0`, and a minimum non-negative duration. Use minute precision, rounding up so the user never sees `0m` while time remains. The optional timezone defaults to `Asia/Ho_Chi_Minh` and is used only for legacy date-only values.
- [ ] **Step 4: Run the focused test again** and require all cases to pass.
- [ ] **Step 5: Commit** with `git add src/features/scheduling/reviewCountdown.ts src/features/scheduling/reviewCountdown.test.ts && git commit -m "feat: calculate next review countdown"`.

### Task 2: Replace Dashboard estimated duration with live countdown

**Files:**
- Modify: `src/components/DashboardView.tsx` around the metric calculations and metric card.
- Create: `src/components/DashboardView.test.tsx` if no Dashboard test file exists.

**Interfaces:**
- Consumes: `activeWords` already filtered by Study Scope and the Task 1 helper.
- Produces: a metric card labelled `Ôn lại sau` with a live value.

- [ ] **Step 1: Write failing component tests** asserting: earliest scheduled review displays `Ôn lại sau` and a formatted countdown; an overdue card displays `Đã đến lúc ôn`; only-new/no-schedule cards display `Chưa có lịch ôn`; the old text `Thời gian ước tính` and `~1 phút` are absent.
- [ ] **Step 2: Run the focused Dashboard test** — `npm test -- --run src/components/DashboardView.test.tsx`; expected failure against the current card.
- [ ] **Step 3: Implement the minimal UI change**: remove `estimatedTimeMinutes`; compute countdown from `activeWords`; add `useEffect`/`useState` with a 60-second interval that updates `now`, clears on unmount, and refreshes when the tab returns to visibility. Pass the existing `Asia/Ho_Chi_Minh` default because `UserSettings` does not yet expose an IANA timezone. Keep the existing card styling and grid placement.
- [ ] **Step 4: Run the focused Dashboard test** and require all assertions to pass.
- [ ] **Step 5: Commit** with `git add src/components/DashboardView.tsx src/components/DashboardView.test.tsx && git commit -m "feat: show next review countdown on dashboard"`.

### Task 3: Validate timezone and regression behavior

**Files:**
- Modify: `src/components/DashboardView.tsx` only if the user timezone is required for date-only legacy values.
- Modify: `src/features/scheduling/reviewCountdown.test.ts` with timezone/date-only cases.
- Modify: `docs/superpowers/specs/2026-07-30-phase-3-fsrs-design.md` (Dashboard display contract).

**Interfaces:**
- Consumes: persisted FSRS timestamps from `mappers.ts`; `getStudyDate` for any date-only fallback.
- Produces: documented UI contract and regression coverage.

- [ ] **Step 1: Add tests** for ISO timestamps crossing midnight in `Asia/Ho_Chi_Minh`, and for legacy date-only values. Date-only values must be interpreted as the user’s next local study-day boundary, not UTC midnight.
- [ ] **Step 2: Run** `npm test -- --run src/features/scheduling/reviewCountdown.test.ts src/components/DashboardView.test.tsx` and verify the new cases fail before fallback logic is added.
- [ ] **Step 3: Implement only the required date-only fallback** using the existing `getStudyDate`/timezone convention; do not alter persisted FSRS timestamps.
- [ ] **Step 4: Update the FSRS spec** to state: Dashboard shows the earliest scheduled card as `Ôn lại sau <countdown>`, overdue as `Đã đến lúc ôn`, and no scheduled cards as `Chưa có lịch ôn`.
- [ ] **Step 5: Run the full verification** — `npm test -- --run`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] **Step 6: Commit** with `git add src docs/superpowers/specs/2026-07-30-phase-3-fsrs-design.md && git commit -m "test: verify review countdown timezone behavior"`.

## Verification Gate

- Dashboard no longer renders `Thời gian ước tính` or the review-count formula based on `0.8` minutes per card.
- Countdown always points to the earliest valid non-new FSRS review in the active Study Scope.
- Overdue reviews are actionable immediately and never display negative time.
- Countdown updates without a page refresh and interval cleanup does not leak timers.
- Existing daily new-word counters and 04:00 study-date behavior remain unchanged.
- Full tests, TypeScript checks, production build, and whitespace checks pass.
