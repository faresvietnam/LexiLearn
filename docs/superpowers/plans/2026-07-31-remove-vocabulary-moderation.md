# Remove Vocabulary Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or **superpowers:executing-plans** to implement this plan task-by-task.

**Goal:** Remove the private-word approval/merge workflow while keeping private words immediately studyable and leaving the Admin workspace as a user directory.

**Architecture:** Remove moderation from the React navigation and application callbacks. Private-word persistence remains owner-scoped and studyable; legacy moderation tables/migrations remain untouched for replay compatibility but are no longer called by the app.

**Tech Stack:** React, TypeScript, Vitest, Supabase repositories and RLS.

## Global Constraints

- Private words remain private and immediately studyable.
- No learner or admin UI may expose Approve, Reject, Merge, Duyệt bài, or pending-submission badges.
- Admin keeps only the Người dùng tab.
- Do not drop already-applied Supabase tables/migrations in this change.
- FSRS state, CSV persistence, Gemini, R2, and learning flow remain unchanged.

### Task 1: Remove moderation UI and callbacks

**Files:** `src/components/AdminWorkspace.tsx`, `src/components/AdminApprovalView.tsx`, `src/components/Navbar.tsx`, `src/App.tsx`, related tests.

- Remove the submissions tab, moderation actions, pending badge, and App approve/reject/merge handlers.
- Keep Admin access role-gated and render only the user directory.
- Update tests to assert that Admin never renders moderation controls.

### Task 2: Remove moderation-dependent client logic

**Files:** `src/features/admin/moderationRepository.ts`, `src/features/admin/moderationRepository.test.ts`, `src/features/import/csvWordBuilder.ts`, `src/utils/sessionBuilder.ts`, `src/components/LearningSessionView.tsx`, `src/types/index.ts`.

- Remove the moderation repository and its tests.
- Stop using approval status to decide whether a word is new or studyable; use FSRS state instead.
- Keep legacy fields only where required to hydrate existing rows, without rendering or branching on them.
- Ensure new manual/CSV private words remain immediately studyable.

### Task 3: Update specification and verification

**Files:** `lexilearn-complete-system-spec.md`, Phase 4 docs, migration-chain tests if needed.

- Replace the current-flow and roadmap descriptions of approval/merge with private-only vocabulary.
- Document that legacy moderation tables are retained but unused.
- Run full tests, lint, and build.

