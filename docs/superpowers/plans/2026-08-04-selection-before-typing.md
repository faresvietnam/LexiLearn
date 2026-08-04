# Selection Before Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Stage 1 learning question multiple choice and defer typing exercises until Stage 2 or later.

**Architecture:** Change only the stage-to-question-type mapping in `sessionBuilder`. Preserve scheduling, queue ordering, question rendering, and persistence behavior.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Stage 1 produces only `en_to_vn_mc` or `vn_to_en_mc`.
- Every Stage 1 question has multiple-choice options.
- Stage 2 prefers word-part selection, then sentence completion, then full-word typing.
- Stages 3–5 retain existing behavior.
- No database or runtime dependency changes.

---

### Task 1: Stage question-type mapping

**Files:**
- Modify: `src/utils/sessionBuilder.ts`
- Test: `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Consumes: `SessionQueueItem.stage`, word parts, and example sentences
- Produces: `Question.type`, `Question.mcOptions`, prompt, and expected answer

- [ ] **Step 1: Write failing regression tests**

Add tests proving multiple Stage 1 cards only produce `en_to_vn_mc` and
`vn_to_en_mc`, all have `mcOptions`, and examples cannot trigger
`sentence_completion`. Add Stage 2 fallback tests for word-part selection,
sentence completion, and full-word typing.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm test -- --run src/utils/sessionBuilder.test.ts
```

Expected: Stage 1 still produces sentence completion and the new Stage 2
fallback expectation fails.

- [ ] **Step 3: Implement the minimal mapping change**

Alternate Stage 1 between the two MC types. In Stage 2, select word parts when
at least two exist; otherwise use sentence completion when an example exists,
then full-word typing.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
npm test -- --run src/utils/sessionBuilder.test.ts
```

Expected: all session builder tests pass.

### Task 2: Full verification and delivery

**Files:**
- Verify: `src/utils/sessionBuilder.ts`
- Verify: `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Produces: verified commit on `main`

- [ ] **Step 1: Run complete verification**

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/superpowers/plans/2026-08-04-selection-before-typing.md \
  src/utils/sessionBuilder.ts src/utils/sessionBuilder.test.ts
git commit -m "fix: select answers before typing"
git push origin main
```

