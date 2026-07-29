# Character Diff Git-style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render incorrect typed answers as a two-line, character-level Git-style comparison using the `diff` library.

**Architecture:** A dedicated presentational component converts `diffChars` output into two aligned rows: removals/unchanged characters for the learner input and additions/unchanged characters for the expected answer. Existing `computeCharDiff` continues to supply SRS error categories and no answer-checking logic changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, React Testing Library, `diff` (jsdiff).

## Global Constraints

- Use `diffChars` from the `diff` package; do not add another handwritten diff algorithm.
- Compare characters, not words.
- Preserve `computeCharDiff` and its `errorTypes` as the SRS data source.
- Render the Git-style UI only for an incorrect typed answer.
- Do not change Supabase, Vercel, FSRS scheduling, retry policy, or navigation.

---

### Task 1: Add a tested Git-style character comparison component

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/components/LearningSessionView.tsx`, `src/components/LearningSessionView.test.tsx`
- Create: `src/components/CharacterDiffComparison.tsx`, `src/components/CharacterDiffComparison.test.tsx`

**Interfaces:**
- `CharacterDiffComparison({ userInput: string; expectedInput: string })` renders `- Bạn nhập:` and `+ Đáp án:` rows.
- It imports `diffChars` from `diff`, consumes already-normalized strings, and renders unchanged text in both rows, removed text only on the red row, and added text only on the green row.

- [x] **Step 1: Write failing presentation tests**

Write tests that render `CharacterDiffComparison` with replacement (`sportation` / `sportationtion`-style), missing, and extra-character inputs. Assert both labeled rows render; unchanged text appears on both; deleted text appears only in `- Bạn nhập:`; added text appears only in `+ Đáp án:`; semantic classes identify red removed and green added segments.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/components/CharacterDiffComparison.test.tsx`

Expected: FAIL because the component and `diff` dependency do not exist.

- [x] **Step 3: Install dependency and implement the smallest component**

Add `diff` to dependencies. Use `diffChars(userInput, expectedInput)`. Render two monospace rows with a leading `- Bạn nhập:` and `+ Đáp án:` label; style removals red and additions green. Use stable part/index keys.

- [x] **Step 4: Replace the existing single-row token renderer**

In `LearningSessionView`, retain the current heading and Vietnamese SRS error summary but replace the `diffResult.tokens.map(...)` display with `CharacterDiffComparison`, passing `diffResult.normalizedUser` and `diffResult.normalizedExpected`.

- [x] **Step 5: Run focused and complete verification**

Run: `npm test -- --run src/components/CharacterDiffComparison.test.tsx src/components/LearningSessionView.test.tsx`

Expected: PASS.

Run: `npm test -- --run && npm run lint && npm run build`

Expected: PASS.
