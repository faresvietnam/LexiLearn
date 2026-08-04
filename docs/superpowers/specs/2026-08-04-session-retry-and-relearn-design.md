# Session Clean-Retype and In-Session Relearn Design

## Goal

Fix two friction points in `LearningSessionView`:

1. After a wrong typed answer, the learner can patch their existing text in place and pass as soon as it matches — they never have to prove they can produce the word from a blank field.
2. A card missed during a session is never revisited until a separate session is started later (via "Continue Learning" or the "Review more at-risk words" button) — there is no way to retry a missed word before the current session ends.

Both changes are scoped to `src/components/LearningSessionView.tsx` and do not touch `sessionBuilder.ts`, the FSRS scheduler, or the rating rules in `automaticRating.ts`.

## 1. Clean-retype gate

Applies to the typed-answer question types that share the free-text input block: `full_word_typing`, `word_part_typing`, `sentence_completion`, `image_question`, `audio_question`. Multiple-choice and `word_part_selection` are unaffected — reselecting is already a fresh action, not an in-place edit.

- Current behavior: on a wrong check, `isChecked` resets to `false` but `typingValue` (and `partTypingValues`) keep their existing content. The learner can correct individual characters against the visible character-diff feedback and re-submit; as soon as the edited value matches, the question passes.
- New behavior: every retry path (the "Thử lại" button and the Enter-to-retry keyboard shortcut) clears `typingValue`/`partTypingValues` back to blank in addition to resetting `isChecked` and `diffResult`. The learner must type the full word again from an empty field. This repeats — wrong → auto-escalating hint level (unchanged) → blank retry — until a fresh, complete attempt matches.
- A question is considered answered as soon as any attempt (first or a later blank-retyped attempt) is correct. No extra "bonus" clean pass is required beyond that — forcing a full blank retype already removes the character-patching shortcut.
- No change to scoring: `deriveAutomaticRating` keeps forcing `Again` whenever `attemptsCount > 1` or the first attempt was wrong, regardless of this change. This is a UX/practice change only, not a scheduling change.

## 2. In-session relearn reinsertion

- `LearningSessionView` currently receives `questions: Question[]` as a fixed prop and only ever reads `questions[currentIndex]`. It becomes local mutable state, initialized from the prop, so questions can be appended mid-session. Every existing reference to `questions` (progress bar, `Câu X / Y` label, finish-session stats) reads from this state instead of the prop, so counts grow naturally when a question is reinserted.
- Reinsertion trigger: when a question is finally answered correctly and `attemptsCount > 1` (i.e. it was not correct on the first attempt), the question is eligible for one in-session replay.
- Cap: track reinserted `meaningCard.id`s in a `Set` for the session. Each meaning card gets at most one reinsertion per session. If the reinserted copy is also missed, it is not reinserted again — the card stays in FSRS `Relearning`/`critical` state and will naturally surface in the next session (via `sessionBuilder.ts`'s existing critical/due handling), consistent with existing behavior.
- Insertion position: the reinserted question is spliced in 5 questions after the current position (`currentIndex + 5`), or appended to the end of the queue if fewer than 5 questions remain. The reinserted item is a shallow clone of the original `Question` object with a new `id` (needed for React list rendering); no distractors, examples, or stage are regenerated.
- Scoring/FSRS: the reinserted occurrence is treated as an ordinary question like any other. It goes through the normal `handleCheckAnswer` → `onAttempt` → `onReviewCompleted` flow and receives its own independent FSRS rating when resolved. A miss-then-correct replay produces another `Again` rating and pushes the card's short relearning due time out again from that point — there is no special-cased "practice only" mode that skips scheduling.
- `SessionStats.reviewsCompleted` and `newWordsLearned` are computed from the final (possibly grown) question list, so they include any in-session replays actually completed.

## Non-goals

- No changes to `sessionBuilder.ts`, FSRS scheduling/rating logic, or the Dashboard "Review more at-risk words" flow.
- No change to MC/word-part-selection retry behavior.
- No configurable reinsertion distance or cap — fixed at "5 questions later" and "1 reinsertion per card" per this spec; revisit only if real usage shows the fixed values are wrong.

## Testing

- `LearningSessionView.test.tsx`: extend with cases for
  - retry clears typed input to blank (typing question types) and the previous diff is not reusable.
  - a question missed then corrected schedules `Again` as before (no behavior regression).
  - a missed question is reinserted 5 questions later (or at the end near the tail of a short session) exactly once, with a fresh `id`.
  - a card that misses both its original and reinserted occurrence is not reinserted a third time, and both occurrences call `onReviewCompleted` independently.
  - progress label/bar and `SessionStats.reviewsCompleted` reflect the grown question count.
