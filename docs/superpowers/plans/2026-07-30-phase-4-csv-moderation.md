# Phase 4 CSV and Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe CSV import and Admin moderation pipeline while preserving pending-word study and the existing learner flow.

**Architecture:** Keep CSV parsing and normalization in a pure TypeScript boundary. Persist import batches and row outcomes through Supabase repositories. Use database transactions/RPCs for moderation mutations, with version checks and audit rows; React views consume repository results rather than embedding SQL.

**Tech Stack:** React/Vite, TypeScript, Vitest, Supabase PostgreSQL/RLS, existing Admin tab.

## Global Constraints

- Global content is never overwritten by learner CSV import.
- New and imported private words enter `pending` and remain immediately studyable.
- Duplicate CSV rows keep the first row and report later rows.
- Admin mutations are version-checked and audited.
- Preserve the current learner navigation and Answer → Retry → Review → Continue flow.
- Commit after every task and run focused tests before each commit.

### Task 1: Robust CSV parser and normalization

**Files:** Create `src/features/import/csvParser.ts` and tests; add parser types under `src/features/import/types.ts`.

- [ ] Add RED tests for quoted commas, escaped quotes, multiline fields, BOM, header normalization, required `word`/meaning validation, duplicate reporting, and lexical-type canonical keys.
- [ ] Implement pure `parseCsv(text)` returning headers, normalized rows, invalid rows, and duplicate report while retaining source row numbers.
- [ ] Verify focused tests, lint, and commit `feat: add robust csv parser`.

### Task 2: Import mapping and validation UI

**Files:** Modify `CsvImportModal.tsx`; add component tests.

- [ ] Render upload, mapping, preview, validation, duplicate report, and conflict-review states using Task 1 results.
- [ ] Allow downloading the duplicate/invalid report and require explicit confirmation before import.
- [ ] Verify component tests and commit `feat: add csv mapping validation flow`.

### Task 3: Import persistence and resumable rows

**Files:** Add Supabase migration/tests, `importRepository.ts`, and App integration tests.

- [ ] Add `imports` and `import_rows` with owner RLS, statuses, row numbers, canonical keys, error details, and idempotency constraints.
- [ ] Persist `uploaded → validating → ready → importing → completed/failed` and resume only pending rows.
- [ ] Verify migration/RLS assertions, repository tests, lint/build, and commit `feat: persist csv imports`.

### Task 4: Global/private matching and Edit Suggestions

**Files:** Modify vocabulary repository and import orchestrator; add migration/RLS and tests.

- [ ] Link identical Global Words without creating duplicates.
- [ ] Report existing Private duplicates without inserting another row.
- [ ] Create pending Private Words for new rows and Edit Suggestions for differing approved Global fields.
- [ ] Verify ownership and non-overwrite tests, then commit `feat: route csv conflicts safely`.

### Task 5: Admin moderation transactions

**Files:** Add moderation RPC migration/tests, repository methods, and Admin UI tests.

- [ ] Implement transactional approve, reject, merge, and Edit & Approve operations.
- [ ] Enforce target selection, immutable learner ownership, status transitions, and submission version checks.
- [ ] Verify stale-version rejection and commit `feat: add moderation transactions`.

### Task 6: Admin audit log and review UX

**Files:** Add audit migration/repository, modify Admin workspace, add UI tests.

- [ ] Record actor, action, target, before/after summary, and timestamp for every moderation mutation.
- [ ] Add review filters and clear conflict/version error feedback without exposing unrelated users' data.
- [ ] Verify admin-only RLS and commit `feat: add moderation audit trail`.

### Task 7: Phase 4 verification gate

- [ ] Run full tests, lint, build, migration assertions, RLS/security advisors, and a manual CSV-to-pending-to-approved smoke test.
- [ ] Update the roadmap/spec completion notes and commit `docs: verify phase 4 csv moderation`.

