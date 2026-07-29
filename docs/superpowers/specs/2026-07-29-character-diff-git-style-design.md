# Character Diff Git-style Design

## Goal

Replace the current one-line character-error display with a familiar two-line Git-style comparison for typing answers, while preserving character-level feedback and the existing SRS error categories.

## Decision

Use the maintained `diff` (jsdiff) package and its `diffChars` API. It produces ordered character-level additions, removals, and unchanged segments, avoiding a custom alignment/diff implementation in the UI.

## UI

When a typing answer is wrong, show this comparison inside the existing error card:

```text
- Bạn nhập:  sportation
+ Đáp án:     transportation
```

- The `- Bạn nhập` row is red-tinted. Removed segments (characters typed by the learner that do not belong in the answer) use a stronger red highlight.
- The `+ Đáp án` row is green-tinted. Added segments (characters required by the answer) use a stronger green highlight.
- Unchanged characters appear in a neutral monospace style in both rows, maintaining direct visual alignment.
- For replacement, jsdiff renders a removal adjacent to an addition; the learner therefore sees both their incorrect character and the expected character on separate lines.
- The existing Vietnamese error summary remains below the comparison.

## Data flow

1. Normalize outer whitespace and case exactly as the current `normalizeText` function does.
2. Call `diffChars(normalizedUser, normalizedExpected)` for display segments.
3. Continue using the existing `computeCharDiff` result as the source for `errorTypes`, `firstErrorIndex`, and SRS retry history. The new dependency changes presentation, not the Phase 1 SRS behaviour.
4. Render the Git-style comparison only when the submission is incorrect and a typing question has a diff result.

## Scope

- Add the `diff` dependency.
- Add a small presentational component near the learning-session UI and tests for replacement, missing, and extra characters.
- Remove the current per-token single-row error rendering after the new component is in place.

## Non-goals

- No word-level diff mode.
- No changes to answer checking, retry policy, SRS state, backend, or Supabase.
