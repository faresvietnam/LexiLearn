# Phase 5 Adaptive Learning and Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add adaptive skill telemetry and forgetting-risk prioritization while preserving the existing FSRS scheduler and learning flow.

**Architecture:** Keep FSRS as the only source of due dates and ratings. Store auxiliary per-card skill scores and response-time aggregates, then use a small pure risk function to order already-eligible cards. Existing question types remain the fallback when content is unavailable.

**Tech Stack:** React/Vite, TypeScript, Vitest, Supabase PostgreSQL/RLS, ts-fsrs.

## Global Constraints

- `desired_retention = 0.90` remains unchanged.
- FSRS owns scheduling; skill scores and forgetting risk never replace FSRS dates.
- Preserve `Check → Retry → Answer Review → Continue`.
- Stage 4 uses partial assistance and falls back to current word-part typing when no richer prompt is available.
- No new external service or dependency unless an existing browser/API capability is insufficient.

### Task 1: Adaptive telemetry model and migration

- [x] Add nullable/defaulted learning-card columns for five skill scores and response-time sample/count/average.
- [x] Add owner-only RLS-compatible repository mapping and migration assertions.
- [x] Verify migration chain, lint, and focused mapper tests.


### Task 2: Skill-score derivation

- [x] Add a pure function mapping question type, correctness, retry, hint/reveal, response time, and diff errors to bounded score updates.
- [x] Add tests for recognition, recall, spelling, context, and word-structure signals.
- [x] Keep FSRS rating path unchanged.


### Task 3: Persist telemetry after review

- [x] Extend learning-card update payloads and repository update/select fields.
- [x] Save derived scores and response-time aggregates with the existing FSRS schedule update.
- [x] Keep local session state alive if telemetry persistence fails.


### Task 4: Versioned forgetting-risk prioritization

- [x] Add a pure risk function combining FSRS retrievability, due/overdue time, lapses, and skill weakness.
- [x] Order only eligible review cards by risk, preserving Critical-first and review limits.
- [x] Add tests proving no new card bypasses an eligible Critical review.


### Task 5: Stage 4 and content expansion baseline

- [x] Make Stage 4 partial assistance explicit in the question model/UI while retaining current fallback rendering.
- [x] Use existing image/audio fields when present; otherwise retain text/audio synthesis fallback.
- [x] Rotate available example sentences deterministically per card/session and record sentence attempts through existing attempt persistence.
- [x] Add sequential Gemini batch add in Add Word: one textarea accepts newline/comma-separated words, with no frontend item cap; each word is analyzed and saved independently so a failed item does not stop the remaining queue.


### Task 6: Phase 5 verification gate

- [x] Run full tests, lint, build, migration assertions, and Supabase advisors.
- [x] Add median response-time baseline calibration and real audio-file playback/question mode.
- [x] Adapt per-card FSRS learning/relearning steps after sufficient response history while retaining 90% retention.
- [x] Add sentence-level analytics aggregation and Progress view reporting.
