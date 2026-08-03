# Critical Immediate Review Design

## Goal

Allow an already-started learning card with `memoryStrength === 'critical'`
to appear in a normal learning session immediately, even when its persisted
`nextReviewDate` is still in the future.

## Current Behavior and Root Cause

`buildSessionQuestions` classifies a non-new card as reviewable only when
`isReviewDue(nextReviewDate)` is true, unless the whole session is explicitly
started in extra-review mode. Consequently, a critical card with a future due
time is omitted from normal **Continue Learning / Học ngay** sessions.

## Selected Design

Change the normal review-queue eligibility rule for non-new cards to:

```text
isReviewDue(nextReviewDate) OR memoryStrength is critical
```

The FSRS new-card decision remains authoritative and is evaluated first.
Therefore a card with `fsrsState === 0` remains a new card even if imported or
default data gives it a critical memory-strength label.

Only session eligibility changes. The following behavior remains unchanged:

- Critical cards participate in the existing review priority ordering.
- `reviewLimitPerDay` still limits the number of review cards selected.
- If an eligible critical review exists, the existing rule that suppresses new
  cards in that session still applies.
- Study-scope, deck, tag, and active-status filtering still applies.
- Weak, stable, and strong cards with future due times remain ineligible for a
  normal session.
- Extra-review mode keeps its existing weak-or-critical behavior.

## Scheduling and Persistence

An early critical review is a real FSRS review, not an untracked practice
attempt. On completion, the existing review pipeline derives an automatic
rating, schedules the card again, and persists its updated FSRS state,
`lastReviewedDate`, `nextReviewDate`, `memoryScore`, and `memoryStrength`.

The implementation must not alter the previously persisted due time merely to
make a card eligible. It must also not redefine critical cards as due in
countdowns, forecasts, or the dashboard's **Reviews Due** metric. “Eligible to
review early” and “scheduled review is due” remain separate concepts.

## Critical Classification

The current FSRS classification remains unchanged:

- Rating `Again` or FSRS state `Relearning` produces `critical`.
- Otherwise, a review card with predicted retrievability below 25% produces
  `critical`.
- New or learning cards are classified as `weak` by the scheduler.

## Tests

Add focused session-builder coverage proving that:

1. An already-started FSRS card marked critical with a future due timestamp is
   included in a normal session as a review card.
2. A future-due weak card remains excluded from a normal session.
3. An FSRS-new card marked critical remains a new card and is not converted
   into an early review.

Run the focused session-builder test suite, then the complete automated test
suite and production build.

