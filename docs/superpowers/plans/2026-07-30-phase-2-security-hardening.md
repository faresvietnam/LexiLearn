# Phase 2 Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Phase 2 migrations replayable and enforce correct Supabase authorization while retaining the admin-only in-app `Admin` tab.

**Architecture:** Add one forward-only hardening migration; never rewrite already-applied migrations. RLS and grants make attempts append-only, constrain ownership across references, separate learner private-content writes from admin moderation, and permit the Admin tab only through the existing role source. Update tests and docs to make the Admin-tab decision canonical.

**Tech Stack:** Supabase PostgreSQL/RLS, React, TypeScript, Vitest.

## Global Constraints

- Keep `Admin` as an in-app tab; do not restore `/admin`.
- Sidebar `Admin` is visible only when `user_roles` contains `admin`.
- Use a new forward-only migration, browser publishable key only, and no service keys.
- Attempts are immutable after insertion; sessions may only transition from active to paused/completed by their owner.
- Do not add FSRS, Gemini/Vercel Functions, CSV persistence, or moderation UI transactions.

### Task 1: Harden database migration, grants, and RLS

**Files:**
- Create: `supabase/migrations/*_phase_2_security_hardening.sql`
- Modify: `supabase/tests/phase_2_identity_rls.sql`

- [ ] **Step 1: Write failing SQL assertions** for a replayable migration, append-only attempts, session-state transitions, learner/admin moderation separation, cross-owner reference rejection, and active-only Global-child reads.
- [ ] **Step 2: Verify RED** by running the SQL assertions against the current project and recording the policy/grant failures.
- [ ] **Step 3: Add one forward-only migration** that uses `drop function if exists public.is_admin()`; revokes event-table update/delete; replaces broad `FOR ALL` policies with operation-specific ownership policies; grants admin Global mutation/read-submission access; prevents learner mutation of moderation fields through a dedicated security-invoker SQL function/policy; and validates referenced-row ownership.
- [ ] **Step 4: Apply and verify** with live read-only policy/grant queries, SQL assertions, and Supabase security advisors.
- [ ] **Step 5: Commit** with `fix: harden phase 2 database security`.

### Task 2: Stabilize auth state and document the Admin-tab decision

**Files:**
- Modify: `src/features/auth/AuthProvider.tsx`, `src/App.tsx`, `src/components/Navbar.test.tsx`
- Modify: `lexilearn-complete-system-spec.md`, `docs/superpowers/specs/2026-07-29-phase-2-persistence-authentication-design.md`, `docs/superpowers/plans/2026-07-29-phase-2-persistence-authentication.md`
- Create/modify: focused auth tests

- [ ] **Step 1: Write failing tests** showing stale role loads cannot overwrite a newer sign-out/user event and learners do not receive the Admin tab.
- [ ] **Step 2: Verify RED** with focused auth/navbar tests.
- [ ] **Step 3: Implement a request-generation guard** in `AuthProvider`, reset learner state synchronously when user identity changes, and retain the existing `roles.includes('admin')` sidebar gate.
- [ ] **Step 4: Update canonical documents** to replace protected `/admin` wording with the user-approved Admin-tab model.
- [ ] **Step 5: Verify and commit** with full tests, lint, build: `fix: harden phase 2 auth and admin access`.

## Self-review

- The plan preserves the user-approved Admin tab and fixes each Critical/Important database/auth finding without expanding to Phase 3.
- Migration work is forward-only and independently verifiable.
