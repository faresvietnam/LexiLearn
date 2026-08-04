# Vocabulary Library Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the global count of unlearned new words, order the filtered vocabulary by earliest review time, and paginate the table at 20 words per page.

**Architecture:** Keep the feature local to `VocabularyLibraryView`: derive the global count from the complete prop, derive a filtered and stably sorted collection without mutating props, then slice the current page for rendering. Component state owns the current page and selection, while filter handlers reset pagination to page 1.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- A word is new and unlearned when at least one meaning has `learningStatus === 'new'` or `fsrsState === 0`.
- The global count is independent of search, filters, and the current page.
- Sort by the earliest valid `nextReviewDate` of each word, ascending; missing or invalid dates sort last.
- Preserve input order for words with equal or invalid review times.
- Render exactly 20 words per page at most.
- Select-all operates only on the current page while selections on other pages remain selected.
- Do not mutate the `words` prop.

---

### Task 1: Vocabulary Library Count, Ordering, and Pagination

**Files:**
- Create: `src/components/VocabularyLibraryView.test.tsx`
- Modify: `src/components/VocabularyLibraryView.tsx`

**Interfaces:**
- Consumes: existing `VocabularyLibraryViewProps` and `Word.meanings`.
- Produces: rendered count text `Từ mới chưa học: N`, page status `Trang X / Y`, row-range summary, and buttons named `Trang trước` and `Trang sau`.

- [ ] **Step 1: Write failing component tests**

Create `src/components/VocabularyLibraryView.test.tsx` with a complete `Word` fixture factory and real component rendering. Cover:

```tsx
it('counts unlearned new words independently of the current filter', () => {
  renderLibrary([
    makeWord({id: 'new-status', word: 'alpha', learningStatus: 'new', fsrsState: 1}),
    makeWord({id: 'new-fsrs', word: 'beta', learningStatus: 'review', fsrsState: 0}),
    makeWord({id: 'learned', word: 'gamma', learningStatus: 'review', fsrsState: 2}),
  ]);

  expect(screen.getByText('Từ mới chưa học: 2')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'gamma'}});
  expect(screen.getByText('Từ mới chưa học: 2')).toBeInTheDocument();
});

it('orders words by their earliest valid review date and puts invalid dates last', () => {
  renderLibrary([
    makeWord({id: 'invalid', word: 'invalid', nextReviewDates: ['not-a-date']}),
    makeWord({id: 'later', word: 'later', nextReviewDates: ['2026-08-10T00:00:00Z']}),
    makeWord({id: 'earlier', word: 'earlier', nextReviewDates: ['2026-08-09T00:00:00Z', '2026-08-01T00:00:00Z']}),
  ]);

  expect(screen.getAllByTestId('vocabulary-word').map((node) => node.textContent))
    .toEqual(['earlier', 'later', 'invalid']);
});

it('shows 20 rows per page and navigates to the remaining rows', () => {
  renderLibrary(Array.from({length: 21}, (_, index) =>
    makeWord({
      id: `word-${index + 1}`,
      word: `word-${String(index + 1).padStart(2, '0')}`,
      nextReviewDates: [`2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`],
    }),
  ));

  expect(screen.getAllByTestId('vocabulary-word')).toHaveLength(20);
  expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Trang sau'}));
  expect(screen.getAllByTestId('vocabulary-word')).toHaveLength(1);
  expect(screen.getByText('word-21')).toBeInTheDocument();
});

it('returns to page one when search changes and selects only visible rows', () => {
  renderLibrary(makeTwentyOneWords());
  fireEvent.click(screen.getByRole('button', {name: 'Trang sau'}));
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'word'}});
  expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Chọn tất cả từ trên trang này'}));
  expect(screen.getByText('Đã chọn 20 từ')).toBeInTheDocument();
});
```

The fixture must populate every required `Word` and `MeaningCard` field. Use
`fireEvent` from Testing Library so the task adds no dependency.

- [ ] **Step 2: Run tests and verify the expected RED state**

Run:

```bash
npm test -- --run src/components/VocabularyLibraryView.test.tsx
```

Expected: FAIL because the new count, pagination controls, test IDs, and current-page selection behavior do not exist.

- [ ] **Step 3: Implement minimal derived state and pagination**

In `VocabularyLibraryView.tsx`:

```tsx
const PAGE_SIZE = 20;

const getEarliestReviewTime = (word: Word): number | null => {
  const validTimes = word.meanings
    .map(({nextReviewDate}) => Date.parse(nextReviewDate))
    .filter(Number.isFinite);
  return validTimes.length > 0 ? Math.min(...validTimes) : null;
};
```

Add `currentPage` state. Compute `newUnlearnedCount`, filter words, stable-sort a copied array by earliest review time and original index, calculate `totalPages`, clamp the page with an effect, and calculate `pageWords` with `slice`.

Update every search/filter `onChange` handler to call `setCurrentPage(1)` alongside its existing state setter.

Render the header summary:

```tsx
<div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2">
  <span className="text-sm font-semibold text-indigo-700">
    Từ mới chưa học: {newUnlearnedCount}
  </span>
</div>
```

Render `pageWords` rather than the full filtered collection. Add
`data-testid="vocabulary-word"` to the word label. Give the table-header
selection button `aria-label="Chọn tất cả từ trên trang này"` and base its
checked state and toggle logic on the IDs in `pageWords`.

Render pagination below the horizontal table scroller:

```tsx
<div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
  <span>Hiển thị {pageStart + 1}–{pageEnd} / {sortedWords.length} từ</span>
  <div>
    <button aria-label="Trang trước" disabled={currentPage === 1}>Trước</button>
    <span>Trang {currentPage} / {totalPages}</span>
    <button aria-label="Trang sau" disabled={currentPage === totalPages}>Sau</button>
  </div>
</div>
```

Do not render the pagination block when `sortedWords.length === 0`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run src/components/VocabularyLibraryView.test.tsx
```

Expected: all Vocabulary Library tests PASS with no warnings.

- [ ] **Step 5: Refactor without changing behavior**

Rename derived collections consistently (`filteredWords`, `sortedWords`,
`pageWords`) and keep date parsing and stable sorting readable. Avoid extracting
a new module because the behavior has only one consumer.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/components/VocabularyLibraryView.tsx src/components/VocabularyLibraryView.test.tsx
git commit -m "feat: paginate vocabulary library by review time"
```
