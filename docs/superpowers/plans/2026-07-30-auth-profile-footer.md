# Auth Profile Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Display the authenticated account and a dedicated logout control in the sidebar.

**Architecture:** `App` reads user/roles/signOut from AuthProvider and supplies a small profile object to Navbar. Navbar renders it only as UI; it does not access Supabase.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, Lucide.

### Task 1: Render account profile and sign out

**Files:**
- Modify: `src/App.tsx`, `src/components/Navbar.tsx`
- Create: `src/components/Navbar.test.tsx`

- [ ] Write a failing Navbar test asserting name/email/avatar fallback, Admin badge, and logout click callback.
- [ ] Run `npm test -- --run src/components/Navbar.test.tsx` and observe RED.
- [ ] Add `userProfile` and `onSignOut` Navbar props; render profile footer and dedicated logout button. Map Google `full_name`/`name`, `avatar_url`/`picture`, then email fallback in App.
- [ ] Run focused test, full suite, lint, and build.
- [ ] Commit: `git commit -m "feat: show auth profile and logout"`.
