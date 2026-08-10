# Sentence Cards Design

## Goal

Add a second, independent content type — **sentence cards** (image + English
sentence + Vietnamese sentence) — reviewed by typing the English sentence
from a randomly shown prompt (image or Vietnamese), scheduled with FSRS. No
analytics/reporting, no daily limits, no decks/tags for this content type.

Deliberately **not** built on top of `Word` / `MeaningCard`: that model is
tied to word-parts, multi-stage progression, and multiple-choice questions
that don't apply to whole-sentence recall. Sentence cards are a parallel,
simpler system that reuses only the pieces that are already generic:
`scheduleCard()` (FSRS) and `uploadWordImage`/`deleteWordImage` (R2 image
upload).

## 1. Data model

New type in `src/types/index.ts`:

```ts
export interface SentenceCard {
  id: string;
  imageUrl: string;
  imageObjectKey: string;
  englishSentence: string;
  vietnameseSentence: string;
  createdAt: string;

  // FSRS scheduling state — same shape/semantics as MeaningCard's fsrs*
  // fields, persisted via the existing generic scheduleCard().
  nextReviewDate: string;
  lastReviewedDate?: string;
  reviewIntervalDays: number;
  fsrsState: FsrsState;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsElapsedDays: number;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  fsrsReps: number;
  fsrsLapses: number;
  fsrsRetrievability: number;
}
```

`memoryScore`/`memoryStrength` are **not** part of this type — they're not
surfaced anywhere in this feature (no report). `scheduleCard()` still
computes and returns them as part of `LearningCardScheduleUpdate`; the
sentence repository persists the DB columns (schema already has them via the
FSRS row shape) but the app-level type simply doesn't expose them.

## 2. Database

New table `sentence_cards`, owner-scoped like `learning_cards`:

```sql
create table public.sentence_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  image_url text not null,
  image_object_key text not null,
  english_sentence text not null,
  vietnamese_sentence text not null,
  created_at timestamptz not null default now(),

  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  review_interval_days integer not null default 0,
  memory_score integer not null default 0,
  memory_strength text not null default 'critical',
  fsrs_state_version smallint not null default 1,
  fsrs_state smallint not null default 0,
  fsrs_stability double precision not null default 0,
  fsrs_difficulty double precision not null default 0,
  fsrs_elapsed_days integer not null default 0,
  fsrs_scheduled_days integer not null default 0,
  fsrs_learning_steps integer not null default 0,
  fsrs_reps integer not null default 0,
  fsrs_lapses integer not null default 0,
  fsrs_retrievability double precision not null default 1
);

alter table public.sentence_cards enable row level security;
revoke all privileges on table public.sentence_cards from public, anon;
grant select, insert, update, delete
  on table public.sentence_cards
  to authenticated;

create policy sentence_cards_owner_all on public.sentence_cards
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
```

Same `fsrs_state`/`fsrs_stability`/... check constraints as
`learning_cards` (see `20260730064946_add_fsrs_learning_card_state.sql`)
apply here too.

## 3. Scheduling — reuse `scheduleCard()` unchanged

`fsrsScheduler.ts` already operates on the generic `LearningCardFsrsRow` /
`LearningCardScheduleUpdate` shapes, not on anything word-specific. A
`sentence_cards` row maps onto that same shape 1:1, so `scheduleCard(row,
rating, reviewedAt)` is called as-is — **no changes to
`fsrsScheduler.ts`**.

## 4. Persistence layer

New `src/features/persistence/sentenceRepository.ts`, following the
existing repository pattern (Supabase client, owner-scoped queries):

- `loadSentenceCards(): Promise<SentenceCard[]>`
- `createSentenceCard(input: {image: File; englishSentence: string; vietnameseSentence: string}): Promise<SentenceCard>` —
  uploads the image via `uploadWordImage`, inserts a row with FSRS defaults
  (new card, `fsrs_state = 0`).
- `updateSentenceCard(id, patch: {englishSentence?; vietnameseSentence?; image?: File}): Promise<SentenceCard>` —
  if a new image is provided, uploads it and deletes the old object key via
  `deleteWordImage`.
- `deleteSentenceCard(id): Promise<void>` — deletes the row and the R2
  object.
- `submitSentenceReview(id, rating: AutomaticRating, reviewedAt: Date): Promise<SentenceCard>` —
  loads the current FSRS row, calls `scheduleCard`, persists the result.

## 5. Navigation & UI

Two existing nav items are renamed and gain a sentence sub-tab each; no new
top-level nav items for add/manage (a new one is added only for review — see
§7).

**"Add data"** (renamed from "Thêm từ mới" / `add_word`) — creation only:
- Sub-tab **"Từ vựng"** (default on open) — existing `AddWordModal` content,
  unchanged.
- Sub-tab **"Câu"** — new `AddSentenceForm`: two columns — left is image
  upload + Vietnamese sentence textarea, right is English sentence textarea.
  Submits via `createSentenceCard`.

**"Data"** (renamed from "Thư viện từ vựng" / `vocabulary`) — view/edit/delete
only:
- Sub-tab **"Từ vựng"** (default on open) — existing `VocabularyLibraryView`
  content, unchanged.
- Sub-tab **"Câu"** — new `SentenceLibraryView`: list of sentence cards
  (thumbnail, Vietnamese sentence, English sentence), edit button (opens
  `AddSentenceForm` pre-filled, calls `updateSentenceCard`), delete button
  (confirm, calls `deleteSentenceCard`). No add entry point here.

Both renamed pages get a small local tab switcher (two buttons) at the top;
no router/URL changes, just local `useState` inside each page component,
matching how other simple toggles in this codebase are done.

## 6. Sentence Review session (new tab)

New nav item `sentence_review` ("Ôn tập câu"), separate from "Học ngay".
New `SentenceReviewView.tsx`.

- On open, load sentence cards where `nextReviewDate <= now`, ordered
  soonest-due-first, into a fixed queue for the session (snapshot at load
  time — no live re-fetch as cards become due mid-session). **No daily
  cap** — every due card at load time is included.
- Empty state: "Không còn câu nào cần ôn tập."
- Per card: pick prompt kind randomly (50/50, not persisted) —
  `'image'` shows only the image, `'vietnamese'` shows only the Vietnamese
  sentence. Never both.
- Text input for the English sentence, submit on Enter or button click.
  Compare via `normalizeText` (from `utils/charDiff`, already
  case/punctuation-insensitive) against `englishSentence`.
  - **Correct**: rating = `'Good'` if this is the first attempt on this
    card, `'Hard'` if it took a 2nd or 3rd attempt. Call
    `submitSentenceReview`, advance to the next card.
  - **Incorrect, attempt 1 or 2**: show inline "Sai rồi, thử lại." message,
    clear the input, let the learner retype (same prompt stays shown).
  - **Incorrect, attempt 3**: show `CharacterDiffComparison` (reused as-is)
    between the typed text and `englishSentence`, reveal the correct
    sentence, rating = `'Again'`. A "Tiếp tục" button persists the review
    and advances — no further retries on this card.

## Non-goals

- No analytics/report surface for sentence cards (`ProgressView` untouched).
- No daily new/review limits, no `StudyScope` deck/tag filtering for
  sentence cards.
- No decks or tags on `SentenceCard`.
- No AI-assisted sentence generation or translation — manual entry only.
- No changes to `fsrsScheduler.ts`, `automaticRating.ts`, or any
  word/`MeaningCard` code path.

## Testing

- `sentenceRepository.test.ts`: create (upload + insert), update (with and
  without image replacement), delete (row + R2 object), review submission
  (delegates to `scheduleCard`, persists result).
- `AddSentenceForm.test.tsx`: submits with image + both sentences; validation
  for empty fields.
- `SentenceLibraryView.test.tsx`: list renders, edit opens pre-filled form,
  delete confirms then removes.
- `SentenceReviewView.test.tsx`: due-card loading and ordering, empty state,
  random prompt kind (image-only vs. Vietnamese-only, never both), grading —
  correct on attempt 1/2/3 (`Good`/`Hard`/`Hard`), wrong on attempts 1-2 (no
  diff shown), wrong on attempt 3 (diff shown, `Again`, no further retry).
