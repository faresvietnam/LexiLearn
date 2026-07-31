# Roadmap Alignment and Sentence Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the canonical roadmap with the personal-key Gemini decision and expose sentence-level review analytics using the attempt data already persisted by the app.

**Architecture:** Keep Gemini browser-direct with the learner's own key and no application-side word-count quota. Add a small pure analytics reducer over study attempts, load only the authenticated user's rows, and render the result inside the existing Progress view without changing the learning flow.

**Tech Stack:** React/Vite, TypeScript, Vitest, Supabase PostgreSQL/RLS.

## Global Constraints

- Preserve `Check → Retry → Answer Review → Continue`.
- Keep FSRS as the scheduling source of truth.
- Do not introduce a Vercel Gemini proxy for personal-key mode.
- Do not add a frontend cap to the number of batch words.
- Scope attempt analytics to the authenticated user through Supabase RLS.

### Task 1: Synchronize the canonical roadmap

**Files:**
- Modify: `lexilearn-complete-system-spec.md`
- Modify: `docs/superpowers/plans/2026-07-30-phase-5-adaptive-learning.md`

- [x] Replace the old Vercel Gemini/quota wording with direct browser calls using `user_settings.gemini_api_key`, provider-enforced limits, and sequential batch processing.
- [x] Mark Phase 5 sentence analytics as the current implementation increment.
- [x] Keep Phase 6 and Phase 7 explicitly pending until their production data and verification work exists.

### Task 2: Add sentence analytics reducer

**Files:**
- Create: `src/features/analytics/sentenceAnalytics.ts`
- Create: `src/features/analytics/sentenceAnalytics.test.ts`

- [x] Define `StudyAttemptAnalyticsRow` and `SentenceAnalytics` types.
- [x] Aggregate attempts by `sentence_key`, counting attempts, correct attempts, first-attempt correctness, average response time, and last seen time.
- [x] Ignore rows without a sentence key and return deterministic score ordering.
- [x] Add tests for empty input, mixed correctness, missing keys, and tie ordering.

### Task 3: Load authenticated analytics and render it

**Files:**
- Modify: `src/features/persistence/sessionRepository.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ProgressView.tsx`
- Create/modify: `src/components/ProgressView.test.tsx`

- [x] Add an owner-scoped repository query for the current user's sentence-keyed attempts.
- [x] Hydrate analytics when the authenticated learner state loads and keep an empty fallback when Supabase is unavailable.
- [x] Render a compact “Sentence performance” section with attempts, accuracy, average response time, and most difficult sentences.
- [x] Keep existing progress cards unchanged when analytics data is empty.

### Task 4: Verification gate

- [ ] Run focused analytics tests, full tests, lint, and build.
- [ ] Perform authenticated learner/admin smoke checks listed in the final response.
- [ ] Record any remaining Phase 6/7 work as pending instead of marking it complete.
