# Vocabulary Library Count, Ordering, and Pagination Design

## Goal

Improve the Vocabulary Library so learners can see how many words they have
not started, browse a manageable number of rows, and see words in the order
they need attention.

## Definitions

- A word is "new and not learned" when at least one of its meaning cards has
  `learningStatus === 'new'` or `fsrsState === 0`.
- A word's review time is the earliest valid `nextReviewDate` among its
  meaning cards.
- Words without a valid review time sort after words with a valid review time.
  Their existing input order is preserved.

## User Interface

- The library header displays a compact summary card reading
  `Từ mới chưa học: N`.
- The count is calculated from the complete `words` collection and does not
  change when search or filters change.
- The table displays at most 20 words per page.
- Pagination below the table shows the displayed row range, current and total
  page count, and Previous/Next controls.
- Previous and Next are disabled on the first and last pages respectively.
- Pagination controls are omitted when the filtered result is empty.

## Data Flow

1. Calculate the global unlearned-new-word count from `words`.
2. Apply the current search, deck, tag, status, and memory-strength filters.
3. Sort filtered words by earliest review time, ascending.
4. Slice the sorted list for the current 20-row page.
5. Render and select rows from the current page only.

Changing search text or any filter resets the current page to page 1. If a
data change makes the current page invalid, the view clamps it to the last
available page.

## Selection Behavior

- The header checkbox selects or clears only the rows visible on the current
  page.
- Individual selections may remain selected when the learner changes pages.
- The bulk-action count continues to reflect every selected word.

## Error and Edge Handling

- Invalid or missing review dates do not break sorting and are placed last.
- The empty-state row remains visible when no words match.
- A filtered result of exactly 20 rows has one page.
- Sorting does not mutate the `words` prop.

## Testing

Component tests will verify:

- Words with either supported new-state signal are counted once.
- The count is independent of filters.
- Words are ordered by their earliest meaning-card review time.
- Invalid review dates appear last.
- Only 20 rows render on the first page and the next page shows the remainder.
- Search and filter changes return pagination to page 1.
- Select-all affects only the current page.

