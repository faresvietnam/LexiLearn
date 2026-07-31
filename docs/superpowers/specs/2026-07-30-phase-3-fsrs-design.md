# Phase 3 FSRS and Learning Flow Design

## Goal

Replace the prototype rule-based SRS calculation with automatic FSRS scheduling while preserving the existing learning interaction and the Supabase persistence boundary.

## Rating contract

`deriveAutomaticRating(input)` is a pure function returning one FSRS rating. The learner never chooses Again/Hard/Good/Easy.

- Reveal or hint level 5, any incorrect first attempt, or any retry: `Again`.
- First-attempt correct with hint level 3+: `Hard`.
- First-attempt correct with hint level 1–2: `Hard` when slow, otherwise `Good`.
- First-attempt correct without hint: recognition questions are `Good`; typed recall is `Easy` when fast, `Good` when normal, and `Hard` when slow.

Speed uses the spec baselines and ratios: fast `<= 0.6`, normal `> 0.6 && <= 1.5`, slow `> 1.5`. Timing excludes hidden-tab time or caps it at the visibility boundary. `image_question` is treated as recognition with a 7-second baseline and can never produce `Easy`.

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

### Progress and Memory Analytics

Progress uses the active Study Scope and has two separate sources of truth. Current memory status comes from `learning_cards.fsrs_state` (`0 = Mới`, `1 = Đang học`, `2 = Review`, `3 = Học lại`) and predicted retention comes from `fsrs_retrievability`; new cards do not receive a predicted-retention average. Observed accuracy, retries, hints, reveals, response time, and activity come from the authenticated user's `study_attempts`. Activity dates use the IANA timezone (default `Asia/Ho_Chi_Minh`) and the 04:00 local study-day boundary. The Progress view updates its local analytics immediately after a recorded attempt and shows aggregate status, retention, and observed performance. Per-card FSRS status, predicted retention, attempts, first-attempt accuracy, and review dates are shown in the Vocabulary Library word-detail popup instead of a separate analytics table.

The Dashboard's review metric is a live `Ôn lại sau` countdown in whole hours to the earliest scheduled non-new FSRS card in the active Study Scope (`0 giờ` means due now; `—` means no schedule). The countdown refreshes every minute and when the tab becomes visible; persisted timestamps remain the scheduling source of truth. `Forecast hôm nay` excludes cards whose `lastReviewedDate` is already in the current 04:00-bounded study day, so the count decreases immediately after a card is answered while future forecast dates still use its next FSRS due date. Session construction treats an explicit non-zero FSRS state as a review card even when legacy history is empty, preventing a due card from producing an empty session.

The Add Word view also supports a sequential batch input. The learner can enter any number of newline- or comma-separated words; the browser sends one Gemini request at a time and saves each result immediately through the existing private-word flow. There is no application-side item cap. A failed word is reported and does not stop later words, while existing Global Vocabulary entries are linked instead of duplicated.

This work does not add CSV, moderation transactions, calibration, or adaptive Stage 4. Gemini direct-browser settings are a separate Phase 3 task after FSRS is stable.

## Image storage

Image binaries are stored in Cloudflare R2. Browser uploads use a short-lived presigned URL issued by a Vercel Function; R2 credentials never reach the browser. Supabase stores only the object key and public/delivered URL metadata. The R2 upload function validates authenticated ownership, content type, size, and object-key scope. This storage path is separate from browser-direct Gemini requests.

## Acceptance tests

- Rating tests cover every rule, speed boundary, recognition/typed distinction, retry, hint, and reveal.
- Scheduler tests prove due/state output is persisted and recovered after reload.
- Learning session tests prove retry and Answer Review behavior are unchanged and persistence failure remains non-blocking.
- Full tests, lint, build, migration verification, and Supabase advisors pass.
