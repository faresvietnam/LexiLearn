# Sentence Word-Order Question Design

## Goal

Add a second sentence-review question type — **word-order arrangement** (tap
shuffled word chips into the correct order) — shown instead of the existing
free-typing question for sentence cards the learner hasn't yet mastered.
Which of the two types appears for a given review is decided per-review from
the card's current FSRS state, mirroring how the Word/MeaningCard system
picks a question stage from mastery level. No new persisted fields and no
change to `scheduleCard()` / `submitSentenceReview()` — only
`SentenceReviewView` gains a second question renderer and a rating
calculation that now accounts for response time.

## 1. Question type selection

Computed per card, per review, from the field already on `SentenceCard`:

```
card.fsrsState !== 2 (New / Learning / Relearning) → Word-order question
card.fsrsState === 2 (Review)                       → Typing question (existing)
```

No new column, no `memoryStrength`/`memoryScore` revival — `fsrsState` alone
is a sufficient two-tier proxy for "mastered vs. not," consistent with the
original sentence-cards spec's decision to keep the schema lean.

## 2. Word-order question (`WordOrderQuestion.tsx`, new)

- Props: `{sentence: string; onResolve: (result: {isCorrect: boolean; wrongAttempts: number; responseTimeMs: number}) => void}`. `wrongAttempts` is the count of failed checks *before* this resolution (0, 1, or 2 on success; always 2 when `isCorrect` is false, since resolution on failure only happens at the 3rd wrong attempt). Self-contained: owns its own attempt/state machine, same shape as the existing typing question's inline state in `SentenceReviewView`.
- On mount: split `sentence` on whitespace into tokens (punctuation stays attached to its word, e.g. `"mirror."`), shuffle into a "pool," start a response-time timer (`performance.now()` at mount).
- UI: an "answer" row (initially empty) above a "pool" row of shuffled chips, matching the reference screenshot. Tapping a pool chip appends it to the end of the answer row and removes it from the pool. Tapping an answer-row chip removes it from the answer row and returns it to the end of the pool (no full reset — this is the explicit "keep it, let them fix" behavior chosen over "clear and restart").
- "Kiểm tra" is disabled until every chip has been moved into the answer row.
- On check: compare the answer-row token array to the original split token array (case-insensitive per-token, exact order) — not the fuzzy `normalizeText`/character-diff comparison used for typing, since this is a discrete arrangement, not free text.
  - **Correct**: capture `responseTimeMs = performance.now() - startTime`, call `onResolve({isCorrect: true, wrongAttempts, responseTimeMs})` (`wrongAttempts` is 0, 1, or 2 — however many failed checks preceded this one).
  - **Incorrect, attempts 1-2**: increment `wrongAttempts`, show "Sai rồi, thử lại." (same copy as typing), leave the answer row exactly as the learner left it (no reset), let them keep rearranging.
  - **Incorrect, attempt 3** (`wrongAttempts` about to become 2... the check that causes the reveal): reveal the correct sentence (plain text, not `CharacterDiffComparison` — there's no per-character diff to show for a token-order mismatch) and a "Tiếp tục" button; only on that button click does it call `onResolve({isCorrect: false, wrongAttempts: 2, responseTimeMs})`, matching the existing typing flow's "reveal, then a separate continue click" shape exactly (`SentenceReviewView` doesn't need two different resolution shapes for the two question types).

## 3. Rating — extend `deriveSentenceRating`, keep the 3-strike framework

`src/features/scheduling/sentenceRating.ts` changes signature from
`deriveSentenceRating(wrongAttemptsBeforeSuccess: number)` to:

```ts
export interface SentenceRatingInput {
  wrongAttemptsBeforeSuccess: number; // 0, 1, or 2 — success on the 3rd wrong attempt doesn't reach this function, it's always 'Again'
  responseTimeMs: number;
  wordCount: number; // englishSentence.trim().split(/\s+/).length
}

export function deriveSentenceRating(input: SentenceRatingInput): AutomaticRating
```

Logic:

```
if wrongAttemptsBeforeSuccess > 0: return 'Hard'   // unchanged from today

// wrongAttemptsBeforeSuccess === 0 (correct on the very first check):
expected = max(4_000, wordCount * 1_200) // word-order: fast, tap-based
speedRatio = responseTimeMs / expected
if speedRatio > 1.5: return 'Hard'
if speedRatio <= 0.6: return 'Easy'
return 'Good'
```

The 3rd-wrong-attempt path continues to call `onSubmitReview(card.id, 'Again')`
directly in `SentenceReviewView`, same as today — it never calls
`deriveSentenceRating`.

The typing question reuses the **same** `deriveSentenceRating`, with its own
expected-time formula (already implicitly present in the current code as
"typing is slower than tapping"):

```
expected = max(12_000, wordCount * 1_800) // typing: new baseline — typing wasn't timed before this change
```

This is one shared rating function for both question types — each caller
passes its own `expected` baseline via `wordCount`, the function itself only
knows about attempts + measured speed. (Existing callers of
`deriveSentenceRating(0)` / `deriveSentenceRating(1)` — i.e. the current
positional-number signature — are the only call sites; both live in
`SentenceReviewView.tsx` and get updated in the same change.)

## 4. `SentenceReviewView.tsx` changes

- Compute `questionKind = card.fsrsState === 2 ? 'typing' : 'word_order'` per card (recomputed on `advance()`, same as `promptKind` today).
- Prompt display (image vs. Vietnamese sentence, random 50/50) is unchanged and shown above **either** question type — word-order still needs the Vietnamese/image cue to know what to build, exactly like typing does today.
- Render `WordOrderQuestion` when `questionKind === 'word_order'`, else the existing typing form.
- Both paths funnel into the same `advance()` / `onSubmitReview()` calls already present; only how `rating` and `responseTimeMs` are produced differs per path.
- The typing path also starts tracking `responseTimeMs` now (it didn't before), using the same `performance.now()`-at-mount approach, so its `deriveSentenceRating` call carries a real value instead of the old attempts-only calculation.

## Non-goals

- No hints for either question type (word-order has nothing analogous to word's hint levels; not introducing one now).
- No change to `sentence_cards` schema, `scheduleCard()`, or `submitSentenceReview()` — rating is still a plain `AutomaticRating` string handed to the existing unchanged persistence call.
- No re-use of `automaticRating.ts` / `QuestionType` — kept sentence rating fully isolated from the word system's rating code, per the original sentence-cards spec's isolation goal. Only the *pattern* (attempts + response time → Good/Hard/Easy/Again) is mirrored, not the code.
- No character-diff view for the word-order reveal (there's no meaningful per-character diff for a token-ordering mistake) — plain reveal text instead.

## Testing

- `sentenceRating.test.ts`: update existing tests for the new object-argument signature; add cases for fast/normal/slow first-try-correct (Easy/Good/Hard) and confirm `wrongAttemptsBeforeSuccess > 0` still always yields `Hard` regardless of speed.
- `WordOrderQuestion.test.tsx` (new): renders shuffled chips, tapping builds the answer row in order, tapping a placed chip returns it to the pool, "Kiểm tra" disabled until all chips placed, wrong-twice-then-reveal-on-third behavior, `onResolve` called with the right `isCorrect`/`attemptsUsed` shape on both success and reveal paths.
- `SentenceReviewView.test.tsx`: update/add cases — a card with `fsrsState !== 2` renders `WordOrderQuestion` instead of the typing input; a card with `fsrsState === 2` still renders typing; both paths still end up calling `onSubmitReview` with the expected rating.
