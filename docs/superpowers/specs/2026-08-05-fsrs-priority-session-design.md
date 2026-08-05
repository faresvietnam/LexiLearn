# FSRS Priority Session Design

## Goal

Change how a normal study session (`handleStartLearning`, not Extra Review,
not single-word practice) picks and sequences cards, so that:

1. Reviews are ordered by urgency (critical/overdue first, then cards about
   to come due, then the rest of the backlog) instead of a single
   forgetting-risk sort.
2. A session never starts with fewer than 5 distinct Learning Cards.
3. A small pool of cards (5-9) still produces a session of at least 10
   questions, by asking the same card in different formats.
4. A card whose FSRS schedule lands it back within the short-term window is
   replayed later in the same session instead of waiting for the next
   session, replacing the existing miss-triggered reinsertion mechanism.
5. None of the above consumes extra `reviewLimitPerDay` / `newWordsPerDay`
   quota beyond what today's card selection already uses.

Scope: `src/utils/sessionBuilder.ts`, `src/components/LearningSessionView.tsx`,
`src/App.tsx` (`handleStartLearning` empty-state message). Extra Review mode
and `handlePracticeSingleWord` are unchanged.

## 1. Shared time threshold

FSRS learning/relearning steps use `10m` or `15m` depending on
`deriveFsrsProfile` (`fsrsScheduler.ts`) — `15m` when the learner's average
response time is slow (≥3 samples, >10s average). To catch both profiles,
every "short-term window" check in this spec uses **15 minutes**, not 10.

## 2. Review tiers (`sessionBuilder.ts`)

Replace the single `forgettingRisk`-sorted `reviewCards` list with three
tiers, concatenated in this order:

- **Tier A — Critical/overdue**: `meaningCard.memoryStrength === 'critical'`
  (existing flag). Sorted by `calculateForgettingRisk` descending, as today.
- **Tier B — Due within 15 minutes**: not critical, not yet due
  (`nextReviewDate > now`), but `nextReviewDate - now <= 15 minutes`. This is
  a new pool — today these cards are excluded from the session entirely.
  Sorted by soonest due first.
- **Tier C — Remaining due**: not critical, already due
  (`nextReviewDate <= now`). This is today's `reviewCards` minus Tier A.
  Sorted by `calculateForgettingRisk` descending, as today.

`Tier A + Tier B + Tier C` becomes the new `reviewCards` ordering. It is then
capped by `reviewLimitPerDay` exactly as today.

The existing rule "if any critical review exists, exclude new words from the
session" is removed. New words are selected up to `newWordsPerDay` regardless
of Tier A contents.

New words continue to be **interleaved 4:1** into the tiered review list,
using the existing loop in `buildSessionQuestions` — this part of the
algorithm does not change, only the review list feeding it does.

## 3. Minimum 5 cards to start a session

After building the final selected queue (tiers A/B/C capped by
`reviewLimitPerDay`, plus new words capped by `newWordsPerDay`), count
distinct `meaningCard.id`s.

- If fewer than 5 → `buildSessionQuestions` returns no questions and a flag
  indicating "not enough cards" (extend the existing return shape with e.g.
  `insufficientCards: boolean`).
- `App.tsx`'s `handleStartLearning` replaces its current generic empty-state
  toast with a message that also reports when enough cards will become
  available, reusing `findNextReview` + `formatReviewCountdown` from
  `reviewCountdown.ts` (already used elsewhere for due-countdown display).

This gate does not reach into not-yet-due-and-not-within-15-minutes cards to
pad the count — if Tiers A/B/C plus new words don't reach 5 distinct cards,
the session simply doesn't start.

## 4. Question variants to reach at least 10 questions

Only when the selected distinct-card count is between 5 and 9 (inclusive).
If the pool already has 10+ cards, behavior is unchanged (one question per
card, as today) — no variants are generated.

```
totalQuestions = max(10, cardCount)
for i in 0..totalQuestions-1:
  cardIndex = i % cardCount            // round-robin over the tier-ordered cards
  card = orderedCards[cardIndex]
  type = nextRotatedTypeForStage(card) // cycles through the stage-valid types
                                        // already used in convertQueueToQuestions;
                                        // repeats a type if the card has no more
                                        // valid types left (no dedup requirement)
```

Round-robin assignment means occurrences of the same card are always at least
`cardCount` (≥5) positions apart, which already satisfies the existing
`enforceWordSpacing` (distance-1) constraint without any new spacing logic.

Because variants only add `Question` entries and never add new
`SessionQueueItem`s, `reviewLimitPerDay` / `newWordsPerDay` accounting (done
before variant generation) is unaffected.

## 5. FSRS-driven in-session reinsertion (replaces the miss-based mechanism)

Remove the existing mechanism in `LearningSessionView.tsx` (lines ~260-274):
`reinsertedMeaningCardIdsRef`, the `attemptsCount > 1` trigger, the fixed
`currentIndex + 5` insertion point, and the one-reinsertion-per-card cap.

Replace with:

- **Trigger**: whenever `onReviewCompleted` resolves with a schedule (i.e.
  every time a question is answered correctly, since FSRS is only invoked on
  a correct answer today), check
  `schedule.card.due.getTime() - reviewedAt.getTime() <= 15 * 60_000`.
  If true, the card needs another pass in this session.
- **Insertion point**: 3 questions after the current position
  (`currentIndex + 4`), clamped to the current queue length. If fewer than 3
  questions remain ahead, the clone is appended right after whatever is left
  — including immediately next, if the queue is nearly exhausted. No minimum
  gap is enforced in that case.
- **Repetition**: unbounded — no per-card cap and no cap on total
  reinsertions. Each reinserted `Question` is a shallow clone with a fresh
  `id`, goes through the normal `handleCheckAnswer` → `onAttempt` →
  `onReviewCompleted` flow, and is itself re-checked against the same
  15-minute rule when it resolves. The loop ends naturally once FSRS moves
  the card's schedule past 15 minutes (typically the second learning step,
  `1d`, or a non-`Again` rating during relearning).
- `SessionStats.reviewsCompleted` / `newWordsLearned`, the progress bar, and
  the `Câu X / Y` label already read from the mutable `sessionQuestions`
  state and need no further change — they naturally grow with reinsertions.

## Non-goals

- No change to `fsrsScheduler.ts`, `automaticRating.ts`, the
  `submit_learning_review` RPC, or `daily_new_word_usage` accounting — the
  new-word quota is already correctly idempotent per card (it only
  increments when the card's *previous* `fsrs_state` was `New`), so repeated
  variants/reinsertions of the same card in one session cannot double-count.
- No change to Extra Review mode or `handlePracticeSingleWord`.
- No deduplication of visually-identical variant questions (same type,
  same distractors) when a card lacks enough data to rotate through types.
- No configurable thresholds (15 minutes, round-robin padding to 10,
  minimum 5 cards, 3-question reinsertion spacing) — all fixed per this spec;
  revisit only if real usage shows the fixed values are wrong.

## Testing

- `sessionBuilder.test.ts`:
  - Tier A/B/C ordering (critical first, then due-within-15-minutes,
    then remaining due), with the 4:1 new-word interleave unchanged.
  - New words are still selected even when critical reviews are present
    (old blocking rule removed).
  - Fewer than 5 distinct cards → empty questions + `insufficientCards: true`.
  - 5-9 distinct cards → exactly `max(10, cardCount)` questions, round-robin
    distributed, spaced ≥ `cardCount` apart for the same card.
  - 10+ distinct cards → no variants generated (one question per card).
- `LearningSessionView.test.tsx`:
  - Remove tests for the old `attemptsCount`/`+5`/cap-1 reinsertion.
  - A correct answer whose FSRS schedule is ≤15 minutes out is reinserted
    3 questions later (or immediately/at the tail near the end of a short
    session).
  - A card that keeps landing within 15 minutes is reinserted repeatedly
    (no cap) until a resolved schedule exceeds 15 minutes.
  - `SessionStats`/progress label reflect the grown question count.
- `App.tsx` / integration: insufficient-card path shows a countdown-bearing
  message instead of starting a session.
