# AI Canonical Word and Three Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canonicalize inflected words only in AI entry flows, require three examples per generated meaning, and show all meanings with their examples in the correct-answer overlay.

**Architecture:** Extend the Gemini response contract with `canonicalWord` and exact-three example validation. Keep manual form submission unchanged, while single and batch AI builders consume the canonical result. Render persisted examples directly in the learning-session answer overlay.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Gemini structured JSON responses.

## Global Constraints

- Canonicalization applies only to single and batch AI actions.
- Manual word entry preserves the exact user-entered word.
- Past tense, participles, `-ing` verbs, and plural nouns canonicalize to dictionary headwords.
- Comparative and superlative forms remain unchanged.
- Every AI-generated meaning has exactly three distinct examples.
- Every meaning and all three examples appear in the correct-answer overlay.
- No new runtime dependency.

---

### Task 1: Gemini canonical-word and example contract

**Files:**
- Modify: `src/features/gemini/geminiClient.ts`
- Test: `src/features/gemini/geminiClient.test.ts`

**Interfaces:**
- Produces: `GeminiWordAnalysis.canonicalWord: string`
- Produces: validated `meanings[].examples` arrays with exactly three distinct sentences
- Consumes: Gemini structured JSON response

- [ ] **Step 1: Write failing contract tests**

Add fixtures showing `abandoned -> abandon`, a meaning with exactly three
examples, rejection of two/four/duplicate examples, and prompt assertions for
plural/verb canonicalization plus comparative preservation.

- [ ] **Step 2: Verify the focused tests fail**

Run:

```bash
npm test -- --run src/features/gemini/geminiClient.test.ts
```

Expected: failures because `canonicalWord` is absent and example cardinality is
not three.

- [ ] **Step 3: Implement the minimal Gemini contract**

Add required `canonicalWord`, set example schema `minItems: 3` and
`maxItems: 3`, validate three unique sentences, update the canonicalization
prompt, validate morphology against `canonicalWord`, and keep defensive
part-of-speech merging at exactly three unique examples.

- [ ] **Step 4: Verify focused tests pass**

Run:

```bash
npm test -- --run src/features/gemini/geminiClient.test.ts
```

Expected: all Gemini client tests pass.

### Task 2: Single and batch AI consume canonical words

**Files:**
- Modify: `src/components/AddWordModal.tsx`
- Test: `src/components/AddWordModal.test.tsx`

**Interfaces:**
- Consumes: `GeminiWordAnalysis.canonicalWord`
- Produces: updated single-word input and canonical batch `Word.word`

- [ ] **Step 1: Write failing UI behavior tests**

Test that single Auto-Fill changes visible `abandoned` to `abandon`, batch AI
saves `children` as `child`, and a manual save keeps an inflected input
unchanged.

- [ ] **Step 2: Verify focused UI tests fail**

Run:

```bash
npm test -- --run src/components/AddWordModal.test.tsx
```

Expected: AI paths still use `data.word` and the single input is not updated.

- [ ] **Step 3: Implement canonical AI mapping**

Set the visible single input from `canonicalWord`; build single and batch words
from the canonical value. Do not add canonicalization to `handleSubmit` or
`createWordFromDraft` for manual input.

- [ ] **Step 4: Verify focused UI tests pass**

Run:

```bash
npm test -- --run src/components/AddWordModal.test.tsx
```

Expected: all AddWordModal tests pass.

### Task 3: Correct-answer overlay example display

**Files:**
- Modify: `src/components/LearningSessionView.tsx`
- Test: `src/components/LearningSessionView.test.tsx`

**Interfaces:**
- Consumes: `currentQuestion.word.meanings[].exampleSentences`
- Produces: scrollable answer review with all meanings and three examples each

- [ ] **Step 1: Write a failing overlay rendering test**

Create a word with two meanings and three literal example sentences per
meaning. Answer correctly and assert that all six sentences, both meanings,
parts of speech, and English definitions are visible.

- [ ] **Step 2: Verify the overlay test fails**

Run:

```bash
npm test -- --run src/components/LearningSessionView.test.tsx
```

Expected: examples are absent from the current overlay.

- [ ] **Step 3: Implement the overlay sections**

Make the card vertically bounded and scrollable. Render every meaning with its
part of speech, optional English definition, and all stored example sentences.
Keep the review status and continue action behavior intact.

- [ ] **Step 4: Verify the overlay test passes**

Run:

```bash
npm test -- --run src/components/LearningSessionView.test.tsx
```

Expected: all LearningSessionView tests pass.

### Task 4: Full verification and delivery

**Files:**
- Verify all modified files

**Interfaces:**
- Produces: tested production build on `main`

- [ ] **Step 1: Run complete verification**

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: zero test failures, zero TypeScript errors, successful build, and no
whitespace errors.

- [ ] **Step 2: Review scope**

Confirm only the plan, Gemini client/tests, AddWordModal/tests, and
LearningSessionView/tests changed.

- [ ] **Step 3: Commit and push**

```bash
git add docs/superpowers/plans/2026-08-04-ai-canonical-word-and-three-examples.md \
  src/features/gemini/geminiClient.ts \
  src/features/gemini/geminiClient.test.ts \
  src/components/AddWordModal.tsx \
  src/components/AddWordModal.test.tsx \
  src/components/LearningSessionView.tsx \
  src/components/LearningSessionView.test.tsx
git commit -m "feat: canonicalize AI vocabulary entries"
git push origin main
```

