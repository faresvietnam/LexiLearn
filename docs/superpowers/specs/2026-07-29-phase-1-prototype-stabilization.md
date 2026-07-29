# LexiLearn — Phase 1: Prototype Stabilization Specification

## Purpose

Stabilize the existing React/Vite prototype without changing its user-facing navigation or introducing production infrastructure. Phase 1 creates a reliable behavioural baseline before Supabase, Vercel, authentication, Gemini, and FSRS are introduced in later phases.

## Scope

Phase 1 retains the current flow:

`Dashboard → Study Scope → normal or extra-review session → answer → retry when needed → answer review → Dashboard`.

The vocabulary library, add/import flows, deck/tag management, settings, and prototype admin screen remain local-state screens. Mock data remains the data source.

## Functional requirements

### Automated behavioural coverage

Add Vitest and React Testing Library with jsdom. The suite must cover:

- Study Scope: active decks and excluded tags include only studyable active words.
- Session builder: review priority, review/new-word limits, critical-review rule, same-word spacing, extra-review filtering, and an honestly empty queue.
- Character-diff normalization and error classifications.
- Prototype SRS: score/interval/strength/history behaviour for correct and incorrect evaluations.
- Learning session completion: retry accumulation, first-attempt accuracy including the last question, new-word count for `pending` words, full-session elapsed time, and preservation of extra-review mode.

### Session queue

- Remove the demo fallback that injects arbitrary cards when no new or due card is eligible.
- Apply the same-word spacing rule to extra-review sessions as well as normal sessions.
- The application continues to show its existing empty-session toast when no question is returned.

### Learning-session state

- A successful answer must write `evaluateSrsAttempt(...).updatedCard` back into the in-memory `words` state through a callback owned by `App`.
- Error types shown by a failed typing attempt must be accumulated across all retry attempts for that question and supplied to SRS when it is eventually answered correctly.
- SRS evaluation uses the diff calculated for the current submission, not React state from a previous render.
- First-attempt accuracy treats every resolved question exactly once, including the final question.
- `newWordsLearned` counts questions whose word has `approvalStatus === 'pending'`.
- `studyTimeSeconds` measures from session start to completion, not only the final question.
- The start mode is passed into `LearningSessionView` and returned unchanged in final `SessionStats.extraReviewMode`.

## Explicit non-goals

- No Supabase schema, Auth, RLS, Storage, migrations, or live persistence.
- No Vercel deployment/configuration, Vercel Functions, or Gemini endpoint.
- No TypeScript FSRS library or production FSRS scheduling.
- No route conversion for `/admin`; the current prototype tab stays intact.
- No visual redesign or change to the existing navigation/learning flow.

## Acceptance criteria

- `npm test -- --run` succeeds.
- `npm run lint` succeeds.
- `npm run build` succeeds.
- A completed answer updates the matching meaning card in `App` state.
- With no eligible cards, `buildSessionQuestions` returns an empty `questions` array.
- Extra-review mode produces only weak/critical review cards and reports `extraReviewMode: true` upon completion.

## Follow-on boundary

Phase 2 starts the clean Supabase schema, RLS, Auth, and Vercel preparation. Phase 3 replaces prototype SRS persistence with the selected TypeScript FSRS integration. This phase intentionally preserves the interfaces needed to make those replacements without coupling to them now.
