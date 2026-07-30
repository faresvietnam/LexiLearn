# Phase 3 FSRS and Learning Flow Design

## Goal

Replace the prototype rule-based SRS calculation with automatic FSRS scheduling while preserving the existing learning interaction and the Supabase persistence boundary.

## Rating contract

`deriveAutomaticRating(input)` is a pure function returning one FSRS rating. The learner never chooses Again/Hard/Good/Easy.

- Reveal or hint level 5, any incorrect first attempt, or any retry: `Again`.
- First-attempt correct with hint level 3+: `Hard`.
- First-attempt correct with hint level 1–2: `Hard` when slow, otherwise `Good`.
- First-attempt correct without hint: recognition questions are `Good`; typed recall is `Easy` when fast, `Good` when normal, and `Hard` when slow.

Speed uses the spec baselines and ratios: fast `<= 0.6`, normal `> 0.6 && <= 1.5`, slow `> 1.5`. Timing excludes hidden-tab time or caps it at the visibility boundary.

## Scheduler contract

Use a maintained TypeScript FSRS library with `desired_retention = 0.90`. The scheduler receives the persisted card state, automatic rating, review timestamp, and retention target, and returns due time, stability, difficulty, retrievability, and updated FSRS state. UI code does not calculate intervals.

Learning/relearning steps remain `10 minutes → 1 day → FSRS review`. The current retry remains in-session and does not erase the failed rating.

## Persistence and UI

- Add versioned FSRS-compatible columns/state to `learning_cards` through a forward migration.
- Persist the resulting card state together with every attempt without changing the session/answer-review sequence.
- Display `Predicted recall: {retrievability}%` and `Review again: {relative due time}` in Answer Review and Word Detail.
- Use existing `memoryScore` only as a display/analytics value derived from retrievability, never as scheduling input.
- Keep Admin as an in-app role-gated tab; no `/admin` route.

## Scope boundaries

## Gemini API key and browser-direct analysis

Each user supplies their own Gemini API key. The key is stored in the user's `user_settings` row protected by owner-only RLS and Supabase encryption at rest; it is never shown in Admin or logs. When Auto-Fill is used, the authenticated user's browser reads its own key and sends the request directly to Gemini. Because the browser must hold the key to make a direct request, this is not equivalent to server-side secret protection; the UI must explain that trade-off and provide clear save/remove controls. The old Express/Vercel proxy is not used for this personal-key flow.

This work does not add CSV, moderation transactions, calibration, or adaptive Stage 4. Gemini direct-browser settings are a separate Phase 3 task after FSRS is stable.

## Acceptance tests

- Rating tests cover every rule, speed boundary, recognition/typed distinction, retry, hint, and reveal.
- Scheduler tests prove due/state output is persisted and recovered after reload.
- Learning session tests prove retry and Answer Review behavior are unchanged and persistence failure remains non-blocking.
- Full tests, lint, build, migration verification, and Supabase advisors pass.
