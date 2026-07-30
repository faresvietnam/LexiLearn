# Task 3 report — Learning-session FSRS integration

Commit subject: `feat: integrate fsrs into learning flow`

The existing learner sequence remains Check → Retry → Answer Review → Continue.
Once a correct answer opens Answer Review, `LearningSessionView` derives the
automatic rating from the complete attempt path and asks App to schedule the
persisted card. A completed retry therefore keeps its failed first attempt and
is sent to FSRS as `Again`.

App uses the owner-scoped `getLearningCardSchedule` and
`updateLearningCardSchedule` repository functions delivered in Task 2. It
passes the persisted row, rating, and review timestamp to the FSRS adapter,
updates the existing `MeaningCard` display fields from the adapter result, and
starts the complete state write without blocking Answer Review. Read, returned
write, and thrown transport failures are recoverable; Continue remains usable
and stale async schedule results cannot leak into the next question.

Answer Review now displays:

- `Predicted recall: {retrievability}%`
- `Review again: {relative due time}`

Word Detail displays the corresponding existing `memoryScore` and
`nextReviewDate` fields. `memoryScore` continues to be display-only and is
populated from FSRS retrievability by the adapter; neither UI uses it as
scheduler input. The shared relative formatter covers minute, hour, day, due
now, and overdue representations without calculating an interval.

## Test-first evidence

The first focused RED run failed because a completed retry did not call a
scheduling boundary and neither Answer Review nor Word Detail rendered the new
schedule labels. After the minimal session/UI implementation, 10 focused tests
passed.

The App integration RED run then reached the unchanged Answer Review flow but
could not find `Predicted recall: 100%`, proving the repository/adapter wiring
was absent. After implementation, all four App integration tests passed,
including a rejected schedule write that still renders the ten-minute `Again`
result and leaves Continue available.

## Verification

- `npm test -- --run` — 103 passing tests across 18 files.
- `npm run lint` — passing.
- `npm run build` — passing.
- `git diff --check` — passing.

The full test run retains the environment's existing Node experimental
`localStorage` warning. The production build retains the existing Vite
chunk-size warning for the 666.82 kB main bundle; both commands exit
successfully.

No Gemini, R2, CSV, moderation, calibration, Stage 4, or Admin routing changes
were made.

## Round 1 review fixes

Hydrated learning cards now retain the existing `lastReviewedDate` evidence
from persistence, and the session builder treats a card with persisted review
evidence plus a future due date as reviewed even when `history` is empty. A
mapper-to-builder regression test proves that a future-due FSRS card is not
reintroduced as a new card after reload.

The learning-session success path no longer calls the legacy
`evaluateSrsAttempt` scheduler. It records immutable attempt analytics and
history only; the FSRS callback remains the sole owner of memory score,
strength, interval, and due-date fields. A regression test asserts those
legacy scheduling fields stay unchanged before the FSRS result is applied.

Focused review-fix verification passed: 32 tests across persistence and
session-builder suites, plus the learning-session and legacy SRS tests. The
full verification run after these fixes passed 106 tests across 18 files,
lint, build, and diff checks. The existing Node localStorage and Vite chunk-size
warnings remain unchanged.

## Round 2 review fix

FSRS schedule updates now include the existing `memory_strength` column. The
adapter derives product labels from FSRS state and predicted recall: Again or
relearning is critical, active learning is weak, and review-state recall uses
the existing strong/stable/weak/critical bands at 80/50/25 percent. App applies
that same value to the existing `MeaningCard`, keeping dashboard and session
queue strength filters aligned with the persisted state.

Regression coverage proves a successful FSRS review persists `strong` and
updates the App schedule payload, while an Again review persists `critical`.
