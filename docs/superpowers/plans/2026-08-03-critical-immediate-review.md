# Critical Immediate Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include already-started critical cards in normal learning sessions even when their FSRS due time is still in the future.

**Architecture:** Keep FSRS scheduling and due-date reporting unchanged. Modify only the review-queue eligibility branch in `buildSessionQuestions`, after the existing new-card classification, so a non-new card is eligible when it is due or critical.

**Tech Stack:** TypeScript, React, Vitest, Vite, `ts-fsrs`

## Global Constraints

- FSRS state remains authoritative when distinguishing new cards from review cards.
- A critical card is eligible early but is not redefined as due.
- `reviewLimitPerDay`, session priority, study-scope filtering, and new-card suppression remain unchanged.
- Weak, stable, and strong future-due cards remain ineligible in normal sessions.
- No dependency, schema, persistence, dashboard, forecast, or countdown changes.

---

### Task 1: Add Critical Early-Review Eligibility

**Files:**
- Modify: `src/utils/sessionBuilder.test.ts`
- Modify: `src/utils/sessionBuilder.ts:48-70`

**Interfaces:**
- Consumes: `buildSessionQuestions(words, studyScope, settings, isExtraReview?, newWordsLimitOverride?)`
- Produces: unchanged `buildSessionQuestions` signature and return type; only normal-session queue membership changes.

- [x] **Step 1: Write the failing regression test**

Add this test inside `describe('buildSessionQuestions', ...)` in
`src/utils/sessionBuilder.test.ts`:

```ts
it('includes an already-started critical card before its due time in a normal session', () => {
  const criticalCard = meaningCard('critical-future', {
    fsrsState: 2,
    memoryStrength: 'critical',
    memoryScore: 10,
    nextReviewDate: '2099-01-01T00:00:00.000Z',
  });

  const session = buildSessionQuestions(
    [word('critical-future', [criticalCard])],
    scope,
    settings,
  );

  expect(session.questions).toHaveLength(1);
  expect(session.questions[0].word.id).toBe('critical-future');
  expect(session.questions[0].isNewWord).toBe(false);
  expect(session.totalAvailableReviews).toBe(1);
});
```

This test catches the bug where replacing the new eligibility branch with
due-only behavior silently drops a future-due critical review.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/utils/sessionBuilder.test.ts
```

Expected: the new test fails because `session.questions` has length `0`, while
the pre-existing tests pass.

- [x] **Step 3: Add boundary coverage before production code**

Add this table-driven test after the critical regression test:

```ts
it.each([
  ['weak', 30],
  ['stable', 60],
  ['strong', 90],
] as const)('keeps a future-due %s card out of a normal session', (memoryStrength, memoryScore) => {
  const futureCard = meaningCard(`${memoryStrength}-future`, {
    fsrsState: 2,
    memoryStrength,
    memoryScore,
    nextReviewDate: '2099-01-01T00:00:00.000Z',
  });

  const session = buildSessionQuestions(
    [word(`${memoryStrength}-future`, [futureCard])],
    scope,
    settings,
  );

  expect(session.questions).toEqual([]);
  expect(session.totalAvailableReviews).toBe(0);
});
```

Retain the existing test `treats FSRS state 0 as new even when legacy history
exists`, which already proves that the new-card branch takes precedence over
the card's default memory-strength label.

- [x] **Step 4: Run the focused test and verify the intended failure remains**

Run:

```bash
npm test -- src/utils/sessionBuilder.test.ts
```

Expected: only the future-due critical regression fails. The weak, stable, and
strong boundary cases pass without production changes.

- [x] **Step 5: Implement the minimal eligibility change**

In `src/utils/sessionBuilder.ts`, replace:

```ts
} else if (isDue || isExtraReview) {
  reviewCards.push({ word, meaningCard, isNewWord: false, stage });
}
```

with:

```ts
} else if (
  isDue
  || meaningCard.memoryStrength === 'critical'
  || isExtraReview
) {
  reviewCards.push({ word, meaningCard, isNewWord: false, stage });
}
```

Do not change `isReviewDue`, the persisted date, countdowns, forecasts,
dashboard metrics, sorting, or review limits.

- [x] **Step 6: Run the focused suite and verify GREEN**

Run:

```bash
npm test -- src/utils/sessionBuilder.test.ts
```

Expected: all `sessionBuilder` tests pass with no warnings.

- [x] **Step 7: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, the production build succeeds, and
`git diff --check` emits no output.

- [x] **Step 8: Commit the implementation**

```bash
git add src/utils/sessionBuilder.test.ts src/utils/sessionBuilder.ts docs/superpowers/plans/2026-08-03-critical-immediate-review.md
git commit -m "feat: allow immediate critical reviews"
```
