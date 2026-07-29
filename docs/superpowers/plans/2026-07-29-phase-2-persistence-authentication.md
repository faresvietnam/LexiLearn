# Phase 2 Persistence and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move LexiLearn from local mock-only state to authenticated, RLS-protected Supabase persistence while preserving the existing React/Vite learning flow.

**Architecture:** Supabase Auth owns identity; a profile trigger and `user_roles` own roles; RLS owns data authorization. A small client/repository layer hydrates the existing domain shapes instead of placing Supabase calls in visual components. Phase 2 persists configuration, personal vocabulary metadata, and session events but deliberately leaves queue scheduling/FSRS, CSV persistence, moderation transactions, and Gemini Functions for later phases.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, `@supabase/supabase-js`, React Router, Supabase PostgreSQL/Auth/RLS.

## Global Constraints

- Work directly on `main`; commit after every completed task using the exact commit subject in that task.
- Never commit `SUPABASE_SERVICE_ROLE_KEY`, Google OAuth Client Secret, or any local `.env` file.
- Browser code uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Enable RLS and define ownership/admin policies before granting `authenticated` access to each `public` table.
- The initial admin email is exactly `thanghong195@gmail.com`, matched case-insensitively; every user receives `learner`.
- Default timezone is `Asia/Ho_Chi_Minh`, and local study day begins at `04:00`.
- Preserve `Dashboard → Study Scope → session → retry → answer review → continue`; do not implement FSRS or Gemini/Vercel Functions in this phase.

---

## File structure

- `supabase/migrations/*_phase_2_schema.sql`: complete schema, trigger, secure helpers, RLS policies, grants, indexes, and seed setting.
- `src/lib/supabase.ts`: guarded browser client and missing-configuration result.
- `src/lib/studyDate.ts`: timezone/04:00 date boundary helpers matching the database contract.
- `src/features/auth/*`: session context, Google sign-in/sign-out actions, auth gate, login view, and admin route guard.
- `src/features/persistence/*`: row/domain mappers and repositories for profile, settings, scope, vocabulary metadata, and session events.
- `src/App.tsx`: orchestration only; receives hydrated state and passes persistence callbacks.
- `src/main.tsx`: application router/provider bootstrap.
- `src/**/*.test.ts?(x)`: TDD coverage for mappers, auth UI state, admin route guard, and persistence callbacks.
- `.env.example`, `README.md`: public environment variables and Google/Supabase setup instructions.

### Task 0: Commit the verified Phase 1 baseline

**Files:**
- Stage only existing Phase 1 and Git-style Character Diff files already present in the working tree.

- [ ] **Step 1: Inspect the exact baseline list**

Run: `git status --short`

Expected: only the previously delivered Phase 1 tests/configuration/UI and their design/plan documents are unstaged or untracked.

- [ ] **Step 2: Run baseline verification**

Run: `npm test -- --run && npm run lint && npm run build`

Expected: all existing tests pass, TypeScript reports no error, and the Vite build exits 0.

- [ ] **Step 3: Commit the baseline**

Run:

```bash
git add package.json package-lock.json vite.config.ts src/App.tsx src/components/LearningSessionView.tsx src/components/LearningSessionView.test.tsx src/components/CharacterDiffComparison.tsx src/components/CharacterDiffComparison.test.tsx src/test/setup.ts src/utils/charDiff.test.ts src/utils/sessionBuilder.ts src/utils/sessionBuilder.test.ts src/utils/srs.test.ts docs/superpowers
git commit -m "feat: stabilize learning prototype"
```

Expected: a clean working tree before Phase 2 changes.

### Task 1: Add Supabase client boundary and configuration contract

**Files:**
- Modify: `package.json`, `package-lock.json`, `.env.example`, `README.md`
- Create: `src/lib/supabase.ts`, `src/lib/supabase.test.ts`, `src/lib/studyDate.ts`, `src/lib/studyDate.test.ts`

**Interfaces:**
- `getSupabaseClient(): SupabaseClient | null` returns a client only when both public environment values exist.
- `getSupabaseConfigurationError(): string | null` returns one actionable Vietnamese message when either variable is absent.
- `getStudyDate(instant: Date, timezone: string, boundary = '04:00'): string` returns `YYYY-MM-DD` using the user-local study-day boundary.

- [ ] **Step 1: Write failing tests**

Test an absent environment reports configuration error without constructing a client. Test `getStudyDate` at `03:59` and `04:00` in `Asia/Ho_Chi_Minh`: the former belongs to the prior local date and the latter to the current local date.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/lib/supabase.test.ts src/lib/studyDate.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Install and implement**

Install exact locked versions of `@supabase/supabase-js` and `react-router-dom`. Implement a singleton browser client that reads `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; never read service keys. Document only these variables in `.env.example` and setup steps in `README.md`. Implement the study-date helper using `Intl.DateTimeFormat(..., { timeZone })`, subtracting one local day before `04:00`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- --run src/lib/supabase.test.ts src/lib/studyDate.test.ts && npm run lint`

Run:

```bash
git add package.json package-lock.json .env.example README.md src/lib
git commit -m "feat: add supabase client boundary"
```

### Task 2: Create and verify the Supabase schema, role bootstrap, and RLS

**Files:**
- Create: `supabase/migrations/*_phase_2_schema.sql`, `supabase/tests/phase_2_rls.sql`

**Interfaces:**
- `public.is_admin()` is a `security definer`, `set search_path = public`, revoked from `PUBLIC`, and granted only to `authenticated`; it returns role membership for `(select auth.uid())`.
- `public.current_study_date(p_user_id uuid, p_at timestamptz default now())` returns the profile-local `date` using its timezone and 04:00 boundary.
- `handle_new_auth_user()` creates `users`, `user_settings`, `learner`, and conditionally `admin` role rows.

- [ ] **Step 1: Create the migration with all phase tables**

Use `supabase migration new phase_2_schema` to create the migration file. Define identity/configuration (`users`, `user_roles`, `user_settings`, `app_settings`, `ai_auto_fill_usage`); content (`global_words`, `global_meanings`, `global_examples`, `word_parts`, `private_words`, `private_meanings`); personal metadata (`decks`, `tags`, `personal_vocabulary`, `personal_word_tags`, `study_scope`, `learning_cards`); events (`study_sessions`, `study_attempts`). Use UUID keys, constrained status/type columns, user-owned foreign keys, `updated_at` triggers, unique normalized values, and indexes on ownership/session lookup paths.

- [ ] **Step 2: Add RLS and grants in the same migration**

Enable RLS on every public application table. Create `TO authenticated` policies with `(select auth.uid()) = user_id` / owner predicate for personal rows, a signed-in read policy for active Global rows, and `is_admin()` mutation policies for Global/admin rows. Include both `USING` and `WITH CHECK` on every update policy. Grant only required table privileges to `authenticated` after RLS policies exist. Seed `gemini_auto_fill_daily_limit = 10` idempotently.

- [ ] **Step 3: Write database verification SQL**

In `supabase/tests/phase_2_rls.sql`, create two test auth identities and assert: normal learner cannot read another learner's Deck/Tag/Vocabulary/Session rows; normal learner cannot mutate Global rows; admin identity can read and mutate admin-scoped rows; profile trigger grants expected roles/defaults; `current_study_date` returns the previous date at 03:59 and current date at 04:00 in `Asia/Ho_Chi_Minh`.

- [ ] **Step 4: Apply, test, inspect, and commit**

Iterate using Supabase `execute_sql`, then apply the final migration to project `whsyzhsvsmyzdaxqrvoi`. Run the verification SQL against the project, list table/policies/functions, and run Supabase advisors. Fix any reported security issue before continuing.

Run:

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: add lexilearn schema and rls"
```

### Task 3: Implement Auth UI and pause for Google OAuth configuration

**Files:**
- Create: `src/features/auth/AuthProvider.tsx`, `src/features/auth/AuthGate.tsx`, `src/features/auth/LoginView.tsx`, `src/features/auth/RequireAdmin.tsx`, `src/features/auth/auth.test.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`, `src/components/Navbar.tsx`, `README.md`

**Interfaces:**
- `AuthProvider` exposes `{ status: 'config-error' | 'loading' | 'authenticated' | 'anonymous', user, roles, signInWithGoogle(), signOut() }`.
- `RequireAdmin` renders children only for a loaded session whose roles include `admin`; otherwise it navigates to `/`.
- `LoginView` invokes `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.

- [ ] **Step 1: Write failing auth and route tests**

Mock the client boundary. Assert config-error shows an actionable setup screen; anonymous users see Login View; a Google button invokes the expected provider/redirect; an authenticated learner visiting `/admin` lands on `/`; an authenticated admin sees the existing admin content at `/admin`; sign-out clears authenticated UI state.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/features/auth/auth.test.tsx`

Expected: FAIL because provider, routes, and auth views do not exist.

- [ ] **Step 3: Implement guarded auth and routes**

Subscribe to `onAuthStateChange`, fetch `user_roles` for the current user, and unsubscribe on unmount. Wrap the app in `BrowserRouter` and `AuthProvider`. Keep current tabs for learner UI but map `/admin` to a protected existing `AdminApprovalView`. Add sign-in/sign-out controls without restoring the prototype role-switcher. Render no learner data before auth is resolved.

- [ ] **Step 4: OAuth credential checkpoint — stop for user action**

Provide the user this exact checklist and wait:

```text
Google Cloud → OAuth Client ID → Web application
Authorized JavaScript origins:
- http://localhost:3000
- https://<your-vercel-project>.vercel.app
Authorized redirect URI:
- https://whsyzhsvsmyzdaxqrvoi.supabase.co/auth/v1/callback

Supabase Dashboard → Authentication → Providers → Google:
- Enable Google
- Enter Client ID and Client Secret

Supabase Dashboard → Authentication → URL Configuration:
- Site URL: https://<your-vercel-project>.vercel.app
- Redirect URLs: http://localhost:3000 and https://<your-vercel-project>.vercel.app
```

Do not request the Client Secret in chat or put it in files. Resume only after user confirms configuration is saved.

- [ ] **Step 5: Perform live Google login verification, then commit**

With public Vite environment variables configured locally, start the Vite development server and complete one Google login. Verify profile trigger rows/roles in Supabase and that admin is protected correctly.

Run:

```bash
git add src/features/auth src/main.tsx src/App.tsx src/components/Navbar.tsx README.md
git commit -m "feat: add google auth and admin guard"
```

### Task 4: Persist learner configuration and personal vocabulary metadata

**Files:**
- Create: `src/features/persistence/mappers.ts`, `src/features/persistence/settingsRepository.ts`, `src/features/persistence/vocabularyRepository.ts`, `src/features/persistence/persistence.test.ts`
- Modify: `src/App.tsx`, `src/components/SettingsView.tsx`, `src/components/StudyScopeModal.tsx`, `src/components/DecksAndTagsView.tsx`, `src/components/VocabularyLibraryView.tsx`, `src/components/AddWordModal.tsx`

**Interfaces:**
- `loadLearnerState(userId): Promise<{ settings, studyScope, decks, tags, words }>` hydrates current frontend domain objects from personal rows and active linked Global/Private content.
- `saveSettings(userId, settings)`, `saveStudyScope(userId, scope)`, `saveWordStatus(userId, vocabularyId, status)`, `saveDeck`, and `saveTag` use authenticated client calls and return typed errors.

- [ ] **Step 1: Write failing mapper/repository tests**

Test mapping of persisted settings/scope/deck/tag/vocabulary rows into existing `UserSettings`, `StudyScope`, `Deck`, `Tag`, and `Word` shapes. Test repository errors are returned as Vietnamese recoverable messages and never mutate local state on failure.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/features/persistence/persistence.test.ts`

Expected: FAIL because mappers and repositories do not exist.

- [ ] **Step 3: Implement repositories and hydrate App**

Load authenticated learner state once after AuthProvider resolves. Replace `INITIAL_*` state after successful hydration. Route existing settings, scope, Deck/Tag creation, vocabulary status/move, direct private word creation, and global linking handlers through repositories; update local state only after a successful response. Retain mock fixtures only when `getSupabaseClient()` is null in local development.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run src/features/persistence/persistence.test.ts && npm test -- --run && npm run lint`

Run:

```bash
git add src/features/persistence src/App.tsx src/components
git commit -m "feat: persist learner vocabulary settings"
```

### Task 5: Persist sessions and attempts without changing scheduling

**Files:**
- Create: `src/features/persistence/sessionRepository.ts`, `src/features/persistence/sessionRepository.test.ts`
- Modify: `src/App.tsx`, `src/components/LearningSessionView.tsx`, `src/types/index.ts`

**Interfaces:**
- `createStudySession(userId, input)` inserts `study_sessions` with a scope snapshot and returns `sessionId`.
- `recordStudyAttempt(userId, sessionId, input)` inserts an immutable `study_attempts` row for every check/retry.
- `completeStudySession(userId, sessionId, endedAt)` changes only the caller-owned active session to `completed`.

- [ ] **Step 1: Write failing repository/component contract tests**

Test that a retry produces two ordered attempt records with attempt numbers, first-attempt flag, hint level, response time, and error types; successful completion sends `completed` with an end time; repository failure does not lose the in-memory learning flow.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/features/persistence/sessionRepository.test.ts src/components/LearningSessionView.test.tsx`

Expected: FAIL because no persisted session/attempt callback exists.

- [ ] **Step 3: Implement persistence callbacks**

Create a session before activating questions. Pass session id and `onAttempt` into `LearningSessionView`; call it for every Check result before retry/answer-review transition. Persist completion and pause state. Keep existing SRS calculation and in-memory card update unchanged; failures show a toast and retain the active local session so learning is never blocked by a temporary write failure.

- [ ] **Step 4: Verify, run RLS checks, and commit**

Run: `npm test -- --run && npm run lint && npm run build`

Run the Task 2 RLS verification SQL against the live project again after session writes are added.

Run:

```bash
git add src/features/persistence/sessionRepository.ts src/features/persistence/sessionRepository.test.ts src/App.tsx src/components/LearningSessionView.tsx src/types/index.ts
git commit -m "feat: persist learning sessions and attempts"
```
