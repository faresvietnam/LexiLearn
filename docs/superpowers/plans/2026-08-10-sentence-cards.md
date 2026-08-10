# Sentence Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sentence cards (image + English sentence + Vietnamese sentence), reviewed by typing the English sentence from a randomly shown image-or-Vietnamese prompt, scheduled with FSRS — as a second content type alongside words, fully isolated from the Word/MeaningCard system.

**Architecture:** New flat Supabase table `sentence_cards` + a small persistence module that reuses the existing generic `scheduleCard()` FSRS function unchanged. Three new presentational components (`AddSentenceForm`, `SentenceLibraryView`, `SentenceReviewView`) receive data and callbacks as props from `App.tsx`, matching the codebase's existing "App.tsx owns data, views are dumb" convention. Two existing nav tabs (`add_word`, `vocabulary`) are relabeled and gain a local sub-tab toggle between "Từ vựng" and "Câu"; one new nav tab (`sentence_review`) is added for the study session.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), `ts-fsrs` (via existing `fsrsScheduler.ts`), Vitest + Testing Library, Tailwind classes matching existing components.

## Global Constraints

- No analytics/report surface for sentence cards (`ProgressView` is untouched).
- No daily new/review limits, no `StudyScope` deck/tag filtering for sentence cards.
- No decks or tags on `SentenceCard`.
- No AI-assisted sentence generation or translation — manual entry only.
- Reuse unchanged: `scheduleCard()` (`fsrsScheduler.ts`), `uploadWordImage`/`deleteWordImage` (`r2ImageUpload.ts`), `normalizeText` (`utils/charDiff.ts`), `CharacterDiffComparison`.
- Nav labels: rename `add_word` → **"Add data"**, `vocabulary` → **"Data"** (verbatim, per product decision — every other label stays Vietnamese).
- Grading: correct on 1st attempt → `Good`; correct on 2nd/3rd attempt → `Hard`; 3rd wrong attempt → reveal diff, rate `Again`, no further retries on that card.
- Prompt selection is 50/50 random per card (image-only or Vietnamese-only, never both), not persisted.

---

## Task 1: `sentence_cards` database table

**Files:**
- Create: `supabase/migrations/20260810120000_add_sentence_cards.sql`

**Interfaces:**
- Produces: table `public.sentence_cards` with columns `id, owner_user_id, image_url, image_object_key, english_sentence, vietnamese_sentence, created_at, next_review_at, last_reviewed_at, review_interval_days, fsrs_state_version, fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps, fsrs_lapses, fsrs_retrievability`. No `memory_score`/`memory_strength`/telemetry columns — those `LearningCardScheduleUpdate` fields are stripped before persisting (see Task 3).

- [ ] **Step 1: Write the migration**

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
  fsrs_state_version smallint not null default 1,
  fsrs_state smallint not null default 0,
  fsrs_stability double precision not null default 0,
  fsrs_difficulty double precision not null default 0,
  fsrs_elapsed_days integer not null default 0,
  fsrs_scheduled_days integer not null default 0,
  fsrs_learning_steps integer not null default 0,
  fsrs_reps integer not null default 0,
  fsrs_lapses integer not null default 0,
  fsrs_retrievability double precision not null default 1,

  constraint sentence_cards_fsrs_state_version_check
    check (fsrs_state_version = 1),
  constraint sentence_cards_fsrs_state_check
    check (fsrs_state between 0 and 3),
  constraint sentence_cards_fsrs_stability_check
    check (fsrs_stability >= 0),
  constraint sentence_cards_fsrs_difficulty_check
    check (fsrs_difficulty between 0 and 10),
  constraint sentence_cards_fsrs_elapsed_days_check
    check (fsrs_elapsed_days >= 0),
  constraint sentence_cards_fsrs_scheduled_days_check
    check (fsrs_scheduled_days >= 0),
  constraint sentence_cards_fsrs_learning_steps_check
    check (fsrs_learning_steps between 0 and 10),
  constraint sentence_cards_fsrs_reps_check
    check (fsrs_reps >= 0),
  constraint sentence_cards_fsrs_lapses_check
    check (fsrs_lapses >= 0 and fsrs_lapses <= fsrs_reps),
  constraint sentence_cards_fsrs_retrievability_check
    check (fsrs_retrievability between 0 and 1)
);

create index sentence_cards_owner_next_review_idx
  on public.sentence_cards (owner_user_id, next_review_at);

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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260810120000_add_sentence_cards.sql
git commit -m "feat: add sentence_cards table for the sentence-recall feature"
```

Note: this sandbox has no local Postgres/Supabase CLI, so the migration cannot be applied or pgTAP-tested here. It will run through the project's normal Supabase migration deploy path. Every later task that touches `sentence_cards` is verified against a mocked Supabase client instead of a real database.

---

## Task 2: `SentenceCard` type + CRUD persistence

**Files:**
- Modify: `src/types/index.ts` (append at end of file)
- Create: `src/features/persistence/sentenceRepository.ts`
- Test: `src/features/persistence/sentenceRepository.test.ts`

**Interfaces:**
- Consumes: `PersistenceResult<T>` from `./settingsRepository` (existing: `{data: T; error: null} | {data: null; error: string}`).
- Produces:
  - `SentenceCard` type (see below).
  - `SentenceCardInput = {imageUrl: string; imageObjectKey: string; englishSentence: string; vietnameseSentence: string}`.
  - `loadSentenceCards(userId: string): Promise<PersistenceResult<SentenceCard[]>>`
  - `createSentenceCard(userId: string, input: SentenceCardInput): Promise<PersistenceResult<SentenceCard>>`
  - `updateSentenceCard(userId: string, id: string, input: SentenceCardInput): Promise<PersistenceResult<SentenceCard>>`
  - `deleteSentenceCard(userId: string, id: string): Promise<PersistenceResult<true>>`

- [ ] **Step 1: Add the `SentenceCard` type**

Append to `src/types/index.ts`:

```ts
export interface SentenceCard {
  id: string;
  imageUrl: string;
  imageObjectKey: string;
  englishSentence: string;
  vietnameseSentence: string;
  createdAt: string;

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

- [ ] **Step 2: Write the failing tests**

Create `src/features/persistence/sentenceRepository.test.ts`:

```ts
import {beforeEach, describe, expect, it, vi} from 'vitest';

function chain(result: {data: unknown; error: unknown}) {
  const builder: any = {};
  ['select', 'insert', 'update', 'delete', 'eq', 'order'].forEach((method) => {
    builder[method] = vi.fn(() => builder);
  });
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: typeof result) => void) => resolve(result);
  return builder;
}

const {getSupabaseClient, from} = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {
  createSentenceCard,
  deleteSentenceCard,
  loadSentenceCards,
  updateSentenceCard,
} from './sentenceRepository';

const SENTENCE_ROW = {
  id: 'sentence-1',
  image_url: 'https://images.example/s1.png',
  image_object_key: 'users/user-1/images/s1.png',
  english_sentence: 'The cat sleeps.',
  vietnamese_sentence: 'Con mèo đang ngủ.',
  created_at: '2026-08-10T00:00:00.000Z',
  next_review_at: '2026-08-10T00:00:00.000Z',
  last_reviewed_at: null,
  review_interval_days: 0,
  fsrs_state_version: 1,
  fsrs_state: 0,
  fsrs_stability: 0,
  fsrs_difficulty: 0,
  fsrs_elapsed_days: 0,
  fsrs_scheduled_days: 0,
  fsrs_learning_steps: 0,
  fsrs_reps: 0,
  fsrs_lapses: 0,
  fsrs_retrievability: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSupabaseClient.mockReturnValue({from});
});

describe('loadSentenceCards', () => {
  it('maps rows for the owner', async () => {
    from.mockReturnValue(chain({data: [SENTENCE_ROW], error: null}));
    const result = await loadSentenceCards('user-1');
    expect(from).toHaveBeenCalledWith('sentence_cards');
    expect(result.data).toEqual([expect.objectContaining({
      id: 'sentence-1',
      englishSentence: 'The cat sleeps.',
      vietnameseSentence: 'Con mèo đang ngủ.',
    })]);
  });

  it('errors when there is no Supabase session', async () => {
    getSupabaseClient.mockReturnValue(null);
    const result = await loadSentenceCards('user-1');
    expect(result).toEqual({data: null, error: expect.any(String)});
  });
});

describe('createSentenceCard', () => {
  it('inserts a trimmed row scoped to the owner', async () => {
    const builder = chain({data: SENTENCE_ROW, error: null});
    from.mockReturnValue(builder);

    const result = await createSentenceCard('user-1', {
      imageUrl: 'https://images.example/s1.png',
      imageObjectKey: 'users/user-1/images/s1.png',
      englishSentence: '  The cat sleeps.  ',
      vietnameseSentence: '  Con mèo đang ngủ.  ',
    });

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_user_id: 'user-1',
      english_sentence: 'The cat sleeps.',
      vietnamese_sentence: 'Con mèo đang ngủ.',
    }));
    expect(result.data?.id).toBe('sentence-1');
  });
});

describe('updateSentenceCard', () => {
  it('updates sentence and image fields scoped to the owner', async () => {
    const builder = chain({data: SENTENCE_ROW, error: null});
    from.mockReturnValue(builder);

    await updateSentenceCard('user-1', 'sentence-1', {
      imageUrl: 'https://images.example/s2.png',
      imageObjectKey: 'users/user-1/images/s2.png',
      englishSentence: 'The cat sleeps well.',
      vietnameseSentence: 'Con mèo ngủ ngon.',
    });

    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      image_object_key: 'users/user-1/images/s2.png',
      english_sentence: 'The cat sleeps well.',
    }));
    expect(builder.eq).toHaveBeenCalledWith('id', 'sentence-1');
    expect(builder.eq).toHaveBeenCalledWith('owner_user_id', 'user-1');
  });
});

describe('deleteSentenceCard', () => {
  it('deletes the row scoped to the owner', async () => {
    from.mockReturnValue(chain({data: [{id: 'sentence-1'}], error: null}));
    const result = await deleteSentenceCard('user-1', 'sentence-1');
    expect(result).toEqual({data: true, error: null});
  });

  it('errors when nothing was deleted', async () => {
    from.mockReturnValue(chain({data: [], error: null}));
    const result = await deleteSentenceCard('user-1', 'sentence-1');
    expect(result.data).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/persistence/sentenceRepository.test.ts`
Expected: FAIL — `sentenceRepository.ts` does not exist yet.

- [ ] **Step 4: Implement `sentenceRepository.ts` (CRUD only — review scheduling is Task 3)**

Create `src/features/persistence/sentenceRepository.ts`:

```ts
import {getSupabaseClient} from '../../lib/supabase';
import {SentenceCard} from '../../types';
import {PersistenceResult} from './settingsRepository';

const LOAD_ERROR = 'Không thể tải danh sách câu. Vui lòng thử lại.';
const SAVE_ERROR = 'Không thể lưu câu. Vui lòng thử lại.';
const DELETE_ERROR = 'Không thể xoá câu. Vui lòng thử lại.';

const SENTENCE_CARD_SELECT = `
  id, image_url, image_object_key, english_sentence, vietnamese_sentence,
  created_at, next_review_at, last_reviewed_at, review_interval_days,
  fsrs_state_version, fsrs_state, fsrs_stability, fsrs_difficulty,
  fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps, fsrs_reps,
  fsrs_lapses, fsrs_retrievability
`;

type SentenceCardRow = {
  id: string;
  image_url: string;
  image_object_key: string;
  english_sentence: string;
  vietnamese_sentence: string;
  created_at: string;
  next_review_at: string;
  last_reviewed_at: string | null;
  review_interval_days: number;
  fsrs_state_version: 1;
  fsrs_state: number;
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_learning_steps: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_retrievability: number;
};

function mapSentenceCardRow(row: SentenceCardRow): SentenceCard {
  return {
    id: row.id,
    imageUrl: row.image_url,
    imageObjectKey: row.image_object_key,
    englishSentence: row.english_sentence,
    vietnameseSentence: row.vietnamese_sentence,
    createdAt: row.created_at,
    nextReviewDate: row.next_review_at,
    ...(row.last_reviewed_at ? {lastReviewedDate: row.last_reviewed_at} : {}),
    reviewIntervalDays: row.review_interval_days,
    fsrsState: row.fsrs_state as SentenceCard['fsrsState'],
    fsrsStability: row.fsrs_stability,
    fsrsDifficulty: row.fsrs_difficulty,
    fsrsElapsedDays: row.fsrs_elapsed_days,
    fsrsScheduledDays: row.fsrs_scheduled_days,
    fsrsLearningSteps: row.fsrs_learning_steps,
    fsrsReps: row.fsrs_reps,
    fsrsLapses: row.fsrs_lapses,
    fsrsRetrievability: row.fsrs_retrievability,
  };
}

export type SentenceCardInput = {
  imageUrl: string;
  imageObjectKey: string;
  englishSentence: string;
  vietnameseSentence: string;
};

export async function loadSentenceCards(
  userId: string,
): Promise<PersistenceResult<SentenceCard[]>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: LOAD_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .select(SENTENCE_CARD_SELECT)
    .eq('owner_user_id', userId)
    .order('next_review_at', {ascending: true});

  return error || !data
    ? {data: null, error: LOAD_ERROR}
    : {data: (data as unknown as SentenceCardRow[]).map(mapSentenceCardRow), error: null};
}

export async function createSentenceCard(
  userId: string,
  input: SentenceCardInput,
): Promise<PersistenceResult<SentenceCard>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: SAVE_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .insert({
      owner_user_id: userId,
      image_url: input.imageUrl,
      image_object_key: input.imageObjectKey,
      english_sentence: input.englishSentence.trim(),
      vietnamese_sentence: input.vietnameseSentence.trim(),
    })
    .select(SENTENCE_CARD_SELECT)
    .single();

  return error || !data
    ? {data: null, error: SAVE_ERROR}
    : {data: mapSentenceCardRow(data as unknown as SentenceCardRow), error: null};
}

export async function updateSentenceCard(
  userId: string,
  id: string,
  input: SentenceCardInput,
): Promise<PersistenceResult<SentenceCard>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: SAVE_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .update({
      image_url: input.imageUrl,
      image_object_key: input.imageObjectKey,
      english_sentence: input.englishSentence.trim(),
      vietnamese_sentence: input.vietnameseSentence.trim(),
    })
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select(SENTENCE_CARD_SELECT)
    .single();

  return error || !data
    ? {data: null, error: SAVE_ERROR}
    : {data: mapSentenceCardRow(data as unknown as SentenceCardRow), error: null};
}

export async function deleteSentenceCard(
  userId: string,
  id: string,
): Promise<PersistenceResult<true>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: DELETE_ERROR};

  const {data, error} = await client
    .from('sentence_cards')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('id');

  return error || !data?.length
    ? {data: null, error: DELETE_ERROR}
    : {data: true, error: null};
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/persistence/sentenceRepository.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/features/persistence/sentenceRepository.ts src/features/persistence/sentenceRepository.test.ts
git commit -m "feat: add SentenceCard type and CRUD persistence"
```

---

## Task 3: Sentence review grading + FSRS scheduling submission

**Files:**
- Create: `src/features/scheduling/sentenceRating.ts`
- Test: `src/features/scheduling/sentenceRating.test.ts`
- Modify: `src/features/persistence/sentenceRepository.ts` (append `submitSentenceReview`)
- Test: append to `src/features/persistence/sentenceRepository.test.ts`

**Interfaces:**
- Consumes: `scheduleCard`, `LearningCardFsrsRow`, `LearningCardScheduleUpdate` from `../scheduling/fsrsScheduler` (existing, unchanged); `AutomaticRating` from `../scheduling/automaticRating` (existing, unchanged).
- Produces:
  - `deriveSentenceRating(wrongAttemptsBeforeSuccess: number): AutomaticRating`
  - `submitSentenceReview(userId: string, id: string, rating: AutomaticRating, reviewedAt: Date): Promise<PersistenceResult<SentenceCard>>`

- [ ] **Step 1: Write the failing test for the grading rule**

Create `src/features/scheduling/sentenceRating.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {deriveSentenceRating} from './sentenceRating';

describe('deriveSentenceRating', () => {
  it('rates Good when the first attempt is correct', () => {
    expect(deriveSentenceRating(0)).toBe('Good');
  });

  it('rates Hard when a retry was needed before the correct attempt', () => {
    expect(deriveSentenceRating(1)).toBe('Hard');
    expect(deriveSentenceRating(2)).toBe('Hard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/scheduling/sentenceRating.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `deriveSentenceRating`**

Create `src/features/scheduling/sentenceRating.ts`:

```ts
import type {AutomaticRating} from './automaticRating';

export function deriveSentenceRating(wrongAttemptsBeforeSuccess: number): AutomaticRating {
  return wrongAttemptsBeforeSuccess === 0 ? 'Good' : 'Hard';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/scheduling/sentenceRating.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `submitSentenceReview`**

Append to `src/features/persistence/sentenceRepository.test.ts` (add the import and a new `describe` block):

```ts
import {submitSentenceReview} from './sentenceRepository';
```

```ts
describe('submitSentenceReview', () => {
  it('reads the FSRS row, schedules it, and persists only schedule columns', async () => {
    const readBuilder = chain({data: SENTENCE_ROW, error: null});
    const updateBuilder = chain({
      data: {...SENTENCE_ROW, fsrs_state: 1, fsrs_reps: 1},
      error: null,
    });
    from.mockReturnValueOnce(readBuilder).mockReturnValueOnce(updateBuilder);

    const result = await submitSentenceReview(
      'user-1',
      'sentence-1',
      'Good',
      new Date('2026-08-10T00:00:00.000Z'),
    );

    expect(updateBuilder.update).toHaveBeenCalledOnce();
    const persistedPayload = updateBuilder.update.mock.calls[0][0];
    expect(persistedPayload).toHaveProperty('fsrs_reps');
    expect(persistedPayload).not.toHaveProperty('memory_score');
    expect(persistedPayload).not.toHaveProperty('memory_strength');
    expect(persistedPayload).not.toHaveProperty('recognition_score');
    expect(result.data?.fsrsReps).toBe(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/features/persistence/sentenceRepository.test.ts`
Expected: FAIL — `submitSentenceReview` is not exported yet.

- [ ] **Step 7: Implement `submitSentenceReview`**

Append to `src/features/persistence/sentenceRepository.ts` (add these imports at the top alongside the existing ones, and the new code at the bottom):

```ts
import type {AutomaticRating} from '../scheduling/automaticRating';
import {
  scheduleCard,
  type LearningCardFsrsRow,
  type LearningCardScheduleUpdate,
} from '../scheduling/fsrsScheduler';
```

```ts
const REVIEW_ERROR = 'Không thể lưu kết quả ôn tập. Vui lòng thử lại.';

const FSRS_ROW_SELECT = `
  id, next_review_at, last_reviewed_at, fsrs_state_version, fsrs_state,
  fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days,
  fsrs_learning_steps, fsrs_reps, fsrs_lapses, fsrs_retrievability
`;

function toSentenceScheduleUpdate(schedule: LearningCardScheduleUpdate) {
  return {
    next_review_at: schedule.next_review_at,
    last_reviewed_at: schedule.last_reviewed_at,
    review_interval_days: schedule.review_interval_days,
    fsrs_state_version: schedule.fsrs_state_version,
    fsrs_state: schedule.fsrs_state,
    fsrs_stability: schedule.fsrs_stability,
    fsrs_difficulty: schedule.fsrs_difficulty,
    fsrs_elapsed_days: schedule.fsrs_elapsed_days,
    fsrs_scheduled_days: schedule.fsrs_scheduled_days,
    fsrs_learning_steps: schedule.fsrs_learning_steps,
    fsrs_reps: schedule.fsrs_reps,
    fsrs_lapses: schedule.fsrs_lapses,
    fsrs_retrievability: schedule.fsrs_retrievability,
  };
}

export async function submitSentenceReview(
  userId: string,
  id: string,
  rating: AutomaticRating,
  reviewedAt: Date,
): Promise<PersistenceResult<SentenceCard>> {
  const client = getSupabaseClient();
  if (!client) return {data: null, error: REVIEW_ERROR};

  const {data: row, error: readError} = await client
    .from('sentence_cards')
    .select(FSRS_ROW_SELECT)
    .eq('id', id)
    .eq('owner_user_id', userId)
    .single();
  if (readError || !row) return {data: null, error: REVIEW_ERROR};

  const {persistence} = scheduleCard(
    row as unknown as LearningCardFsrsRow,
    rating,
    reviewedAt,
  );

  const {data, error} = await client
    .from('sentence_cards')
    .update(toSentenceScheduleUpdate(persistence))
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select(SENTENCE_CARD_SELECT)
    .single();

  return error || !data
    ? {data: null, error: REVIEW_ERROR}
    : {data: mapSentenceCardRow(data as unknown as SentenceCardRow), error: null};
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/features/persistence/sentenceRepository.test.ts src/features/scheduling/sentenceRating.test.ts`
Expected: PASS

- [ ] **Step 9: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/features/scheduling/sentenceRating.ts src/features/scheduling/sentenceRating.test.ts src/features/persistence/sentenceRepository.ts src/features/persistence/sentenceRepository.test.ts
git commit -m "feat: schedule sentence reviews with FSRS"
```

---

## Task 4: `SubTabToggle` component

**Files:**
- Create: `src/components/SubTabToggle.tsx`
- Test: `src/components/SubTabToggle.test.tsx`

**Interfaces:**
- Produces: `SubTabToggle({options: Array<{id: string; label: string}>, activeId: string, onSelect: (id: string) => void})` — used by `App.tsx` (Task 9) above both the "Add data" and "Data" pages.

- [ ] **Step 1: Write the failing test**

Create `src/components/SubTabToggle.test.tsx`:

```tsx
import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SubTabToggle} from './SubTabToggle';

afterEach(cleanup);

describe('SubTabToggle', () => {
  it('marks the active option pressed and reports selection of the other', () => {
    const onSelect = vi.fn();
    render(
      <SubTabToggle
        options={[{id: 'word', label: 'Từ vựng'}, {id: 'sentence', label: 'Câu'}]}
        activeId="word"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('button', {name: 'Từ vựng'})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', {name: 'Câu'})).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', {name: 'Câu'}));
    expect(onSelect).toHaveBeenCalledWith('sentence');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SubTabToggle.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `SubTabToggle`**

Create `src/components/SubTabToggle.tsx`:

```tsx
import React from 'react';

export interface SubTabOption {
  id: string;
  label: string;
}

interface SubTabToggleProps {
  options: SubTabOption[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const SubTabToggle: React.FC<SubTabToggleProps> = ({
  options,
  activeId,
  onSelect,
}) => (
  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1 mb-6">
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        onClick={() => onSelect(option.id)}
        aria-pressed={activeId === option.id}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
          activeId === option.id
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SubTabToggle.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SubTabToggle.tsx src/components/SubTabToggle.test.tsx
git commit -m "feat: add SubTabToggle for the Add data / Data sub-navigation"
```

---

## Task 5: `AddSentenceForm` component

**Files:**
- Create: `src/components/AddSentenceForm.tsx`
- Test: `src/components/AddSentenceForm.test.tsx`

**Interfaces:**
- Consumes: `uploadWordImage`, `deleteWordImage`, `UploadedImage` from `../features/images/r2ImageUpload` (existing, unchanged); `SentenceCard` from `../types`; `SentenceCardInput` from `../features/persistence/sentenceRepository` (Task 2).
- Produces: `AddSentenceForm({initialCard?: SentenceCard, onSave: (input: SentenceCardInput) => Promise<boolean>, onClose: () => void})` — used directly by `App.tsx` for create (Task 9) and by `SentenceLibraryView` for edit (Task 6).

- [ ] **Step 1: Write the failing tests**

Create `src/components/AddSentenceForm.test.tsx`:

```tsx
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const {deleteWordImage, uploadWordImage} = vi.hoisted(() => ({
  deleteWordImage: vi.fn().mockResolvedValue(undefined),
  uploadWordImage: vi.fn(),
}));

vi.mock('../features/images/r2ImageUpload', () => ({deleteWordImage, uploadWordImage}));

import {AddSentenceForm} from './AddSentenceForm';
import type {SentenceCard} from '../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  deleteWordImage.mockResolvedValue(undefined);
});

const EXISTING_CARD: SentenceCard = {
  id: 'sentence-1',
  imageUrl: 'https://images.example/original.png',
  imageObjectKey: 'users/user-1/images/original.png',
  englishSentence: 'The cat sleeps.',
  vietnameseSentence: 'Con mèo đang ngủ.',
  createdAt: '2026-08-01T00:00:00.000Z',
  nextReviewDate: '2026-08-01T00:00:00.000Z',
  reviewIntervalDays: 0,
  fsrsState: 0,
  fsrsStability: 0,
  fsrsDifficulty: 0,
  fsrsElapsedDays: 0,
  fsrsScheduledDays: 0,
  fsrsLearningSteps: 0,
  fsrsReps: 0,
  fsrsLapses: 0,
  fsrsRetrievability: 1,
};

describe('AddSentenceForm — create mode', () => {
  it('disables save until an image and both sentences are present', () => {
    render(<AddSentenceForm onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', {name: 'Lưu câu'})).toBeDisabled();
  });

  it('saves image + sentences and closes on success', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<AddSentenceForm onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat.png', {type: 'image/png'})]},
    });
    await screen.findByAltText('Ảnh minh họa xem trước');

    fireEvent.change(screen.getByLabelText('Câu tiếng Anh'), {
      target: {value: 'The cat sleeps.'},
    });
    fireEvent.change(screen.getByLabelText('Câu tiếng Việt'), {
      target: {value: 'Con mèo đang ngủ.'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      imageUrl: 'https://images.example/new.png',
      imageObjectKey: 'users/user-1/images/new.png',
      englishSentence: 'The cat sleeps.',
      vietnameseSentence: 'Con mèo đang ngủ.',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('cleans up an uploaded image when the form unmounts before saving', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    const view = render(<AddSentenceForm onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat.png', {type: 'image/png'})]},
    });
    await screen.findByAltText('Ảnh minh họa xem trước');
    view.unmount();

    await waitFor(() => expect(deleteWordImage).toHaveBeenCalledWith(
      'users/user-1/images/new.png',
    ));
  });
});

describe('AddSentenceForm — edit mode', () => {
  it('pre-fills fields and does not delete the existing image when unchanged', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddSentenceForm initialCard={EXISTING_CARD} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Câu tiếng Anh')).toHaveValue('The cat sleeps.');
    expect(screen.getByLabelText('Câu tiếng Việt')).toHaveValue('Con mèo đang ngủ.');

    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      imageObjectKey: 'users/user-1/images/original.png',
    })));
    expect(deleteWordImage).not.toHaveBeenCalled();
  });

  it('does not delete the original image on a single replace (deletion is the caller\'s job)', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    render(<AddSentenceForm initialCard={EXISTING_CARD} onSave={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat2.png', {type: 'image/png'})]},
    });
    await waitFor(() => expect(uploadWordImage).toHaveBeenCalledOnce());
    expect(deleteWordImage).not.toHaveBeenCalledWith('users/user-1/images/original.png');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/AddSentenceForm.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `AddSentenceForm`**

Create `src/components/AddSentenceForm.tsx`:

```tsx
import React, {useEffect, useRef, useState} from 'react';
import {deleteWordImage, uploadWordImage} from '../features/images/r2ImageUpload';
import type {UploadedImage} from '../features/images/r2ImageUpload';
import {SentenceCard} from '../types';
import type {SentenceCardInput} from '../features/persistence/sentenceRepository';

interface AddSentenceFormProps {
  initialCard?: SentenceCard;
  onSave: (input: SentenceCardInput) => Promise<boolean>;
  onClose: () => void;
}

export const AddSentenceForm: React.FC<AddSentenceFormProps> = ({
  initialCard,
  onSave,
  onClose,
}) => {
  const [englishSentence, setEnglishSentence] = useState(initialCard?.englishSentence ?? '');
  const [vietnameseSentence, setVietnameseSentence] = useState(initialCard?.vietnameseSentence ?? '');
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(
    initialCard
      ? {objectKey: initialCard.imageObjectKey, publicUrl: initialCard.imageUrl}
      : null,
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const uploadedImageRef = useRef<UploadedImage | null>(uploadedImage);
  const imageCommittedRef = useRef(!!initialCard);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setIsImageUploading(true);
    try {
      const metadata = await uploadWordImage(file);
      if (uploadedImage && !imageCommittedRef.current) {
        void deleteWordImage(uploadedImage.objectKey).catch(() => undefined);
      }
      imageCommittedRef.current = false;
      uploadedImageRef.current = metadata;
      setUploadedImage(metadata);
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : 'Không thể tải ảnh lên R2. Vui lòng thử lại.',
      );
    } finally {
      setIsImageUploading(false);
    }
  };

  useEffect(() => () => {
    const image = uploadedImageRef.current;
    if (image && !imageCommittedRef.current) {
      void deleteWordImage(image.objectKey).catch(() => undefined);
    }
  }, []);

  const isValid = Boolean(
    uploadedImage && englishSentence.trim() && vietnameseSentence.trim(),
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || !uploadedImage) return;

    setIsSaving(true);
    let saved = false;
    try {
      saved = await onSave({
        imageUrl: uploadedImage.publicUrl,
        imageObjectKey: uploadedImage.objectKey,
        englishSentence,
        vietnameseSentence,
      });
    } finally {
      setIsSaving(false);
    }
    if (saved) {
      imageCommittedRef.current = true;
      onClose();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {initialCard ? 'Sửa câu' : 'Thêm câu mới'}
      </h1>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="sentence-image" className="text-xs font-bold text-slate-700">
                Ảnh minh họa
              </label>
              <input
                id="sentence-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void handleImageChange(event)}
                disabled={isImageUploading}
                className="block w-full text-xs text-slate-600"
              />
              {isImageUploading && (
                <p className="text-xs text-slate-500">Đang tải ảnh...</p>
              )}
              {uploadedImage && !isImageUploading && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <img
                    src={uploadedImage.publicUrl}
                    alt="Ảnh minh họa xem trước"
                    className="max-h-48 w-full rounded-lg object-contain"
                  />
                </div>
              )}
              {imageError && (
                <p role="alert" className="text-xs text-rose-700">{imageError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sentence-vi" className="text-xs font-bold text-slate-700">
                Câu tiếng Việt
              </label>
              <textarea
                id="sentence-vi"
                value={vietnameseSentence}
                onChange={(event) => setVietnameseSentence(event.target.value)}
                placeholder="e.g. Con mèo đang ngủ trên ghế sofa."
                rows={4}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sentence-en" className="text-xs font-bold text-slate-700">
              Câu tiếng Anh
            </label>
            <textarea
              id="sentence-en"
              value={englishSentence}
              onChange={(event) => setEnglishSentence(event.target.value)}
              placeholder="e.g. The cat is sleeping on the sofa."
              rows={10}
              className="w-full h-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={!isValid || isSaving || isImageUploading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {isSaving ? 'Đang lưu...' : 'Lưu câu'}
          </button>
        </div>
      </form>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/AddSentenceForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/AddSentenceForm.tsx src/components/AddSentenceForm.test.tsx
git commit -m "feat: add AddSentenceForm for creating and editing sentence cards"
```

---

## Task 6: `SentenceLibraryView` component

**Files:**
- Create: `src/components/SentenceLibraryView.tsx`
- Test: `src/components/SentenceLibraryView.test.tsx`

**Interfaces:**
- Consumes: `SentenceCard` from `../types`; `SentenceCardInput` from `../features/persistence/sentenceRepository` (Task 2); `AddSentenceForm` (Task 5).
- Produces: `SentenceLibraryView({sentenceCards: SentenceCard[], onEditSentenceCard: (id: string, input: SentenceCardInput) => Promise<boolean>, onDeleteSentenceCard: (card: SentenceCard) => Promise<boolean>})` — used by `App.tsx` (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `src/components/SentenceLibraryView.test.tsx`:

```tsx
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SentenceLibraryView} from './SentenceLibraryView';
import type {SentenceCard} from '../types';

afterEach(cleanup);

const CARD: SentenceCard = {
  id: 'sentence-1',
  imageUrl: 'https://images.example/cat.png',
  imageObjectKey: 'users/user-1/images/cat.png',
  englishSentence: 'The cat sleeps.',
  vietnameseSentence: 'Con mèo đang ngủ.',
  createdAt: '2026-08-01T00:00:00.000Z',
  nextReviewDate: '2026-08-01T00:00:00.000Z',
  reviewIntervalDays: 0,
  fsrsState: 0,
  fsrsStability: 0,
  fsrsDifficulty: 0,
  fsrsElapsedDays: 0,
  fsrsScheduledDays: 0,
  fsrsLearningSteps: 0,
  fsrsReps: 0,
  fsrsLapses: 0,
  fsrsRetrievability: 1,
};

describe('SentenceLibraryView', () => {
  it('shows an empty state with no cards', () => {
    render(
      <SentenceLibraryView
        sentenceCards={[]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={vi.fn()}
      />,
    );
    expect(screen.getByText(/Chưa có câu nào/)).toBeInTheDocument();
  });

  it('lists a card and calls onDeleteSentenceCard on delete click', () => {
    const onDeleteSentenceCard = vi.fn().mockResolvedValue(true);
    render(
      <SentenceLibraryView
        sentenceCards={[CARD]}
        onEditSentenceCard={vi.fn()}
        onDeleteSentenceCard={onDeleteSentenceCard}
      />,
    );

    expect(screen.getByText('The cat sleeps.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Xoá câu: The cat sleeps.'}));
    expect(onDeleteSentenceCard).toHaveBeenCalledWith(CARD);
  });

  it('opens the edit form pre-filled and saves through onEditSentenceCard', async () => {
    const onEditSentenceCard = vi.fn().mockResolvedValue(true);
    render(
      <SentenceLibraryView
        sentenceCards={[CARD]}
        onEditSentenceCard={onEditSentenceCard}
        onDeleteSentenceCard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Sửa câu: The cat sleeps.'}));
    expect(screen.getByLabelText('Câu tiếng Anh')).toHaveValue('The cat sleeps.');

    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));
    await waitFor(() => expect(onEditSentenceCard).toHaveBeenCalledWith(
      'sentence-1',
      expect.objectContaining({englishSentence: 'The cat sleeps.'}),
    ));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/SentenceLibraryView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `SentenceLibraryView`**

Create `src/components/SentenceLibraryView.tsx`:

```tsx
import React, {useState} from 'react';
import {Pencil, Trash2} from 'lucide-react';
import {SentenceCard} from '../types';
import type {SentenceCardInput} from '../features/persistence/sentenceRepository';
import {AddSentenceForm} from './AddSentenceForm';

interface SentenceLibraryViewProps {
  sentenceCards: SentenceCard[];
  onEditSentenceCard: (id: string, input: SentenceCardInput) => Promise<boolean>;
  onDeleteSentenceCard: (card: SentenceCard) => Promise<boolean>;
}

export const SentenceLibraryView: React.FC<SentenceLibraryViewProps> = ({
  sentenceCards,
  onEditSentenceCard,
  onDeleteSentenceCard,
}) => {
  const [editingCard, setEditingCard] = useState<SentenceCard | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Thư viện câu</h1>

      {sentenceCards.length === 0 ? (
        <p className="text-sm text-slate-500">
          Chưa có câu nào. Vào "Add data" để thêm câu mới.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sentenceCards.map((card) => (
            <div
              key={card.id}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
            >
              <img src={card.imageUrl} alt="" className="w-full h-32 object-cover" />
              <div className="p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-900">{card.englishSentence}</p>
                <p className="text-sm text-slate-500">{card.vietnameseSentence}</p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingCard(card)}
                    aria-label={`Sửa câu: ${card.englishSentence}`}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteSentenceCard(card)}
                    aria-label={`Xoá câu: ${card.englishSentence}`}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingCard && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 overflow-y-auto">
          <AddSentenceForm
            initialCard={editingCard}
            onSave={(input) => onEditSentenceCard(editingCard.id, input)}
            onClose={() => setEditingCard(null)}
          />
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SentenceLibraryView.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/SentenceLibraryView.tsx src/components/SentenceLibraryView.test.tsx
git commit -m "feat: add SentenceLibraryView for viewing, editing, and deleting sentence cards"
```

---

## Task 7: `SentenceReviewView` component (the study session)

**Files:**
- Create: `src/components/SentenceReviewView.tsx`
- Test: `src/components/SentenceReviewView.test.tsx`

**Interfaces:**
- Consumes: `SentenceCard` from `../types`; `AutomaticRating` from `../features/scheduling/automaticRating` (existing); `deriveSentenceRating` from `../features/scheduling/sentenceRating` (Task 3); `normalizeText` from `../utils/charDiff` (existing); `CharacterDiffComparison` (existing, props `{userInput, expectedInput}`).
- Produces: `SentenceReviewView({sentenceCards: SentenceCard[], onSubmitReview: (cardId: string, rating: AutomaticRating) => Promise<boolean>})` — used by `App.tsx` (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `src/components/SentenceReviewView.test.tsx`:

```tsx
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SentenceReviewView} from './SentenceReviewView';
import type {SentenceCard} from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function buildCard(overrides: Partial<SentenceCard> = {}): SentenceCard {
  return {
    id: 'sentence-1',
    imageUrl: 'https://images.example/cat.png',
    imageObjectKey: 'users/user-1/images/cat.png',
    englishSentence: 'The cat sleeps.',
    vietnameseSentence: 'Con mèo đang ngủ.',
    createdAt: '2026-08-01T00:00:00.000Z',
    nextReviewDate: '2026-08-01T00:00:00.000Z',
    reviewIntervalDays: 0,
    fsrsState: 0,
    fsrsStability: 0,
    fsrsDifficulty: 0,
    fsrsElapsedDays: 0,
    fsrsScheduledDays: 0,
    fsrsLearningSteps: 0,
    fsrsReps: 0,
    fsrsLapses: 0,
    fsrsRetrievability: 1,
    ...overrides,
  };
}

describe('SentenceReviewView', () => {
  it('shows the empty state when no card is due', () => {
    render(
      <SentenceReviewView
        sentenceCards={[buildCard({nextReviewDate: '2099-01-01T00:00:00.000Z'})]}
        onSubmitReview={vi.fn()}
      />,
    );
    expect(screen.getByText('Không còn câu nào cần ôn tập.')).toBeInTheDocument();
  });

  it('shows the Vietnamese sentence as the prompt and rates Good on a correct first try', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard()]} onSubmitReview={onSubmitReview} />);

    expect(screen.getByText('Con mèo đang ngủ.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {
      target: {value: 'The cat sleeps.'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Good'));
  });

  it('shows the image as the prompt when random picks image', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    render(<SentenceReviewView sentenceCards={[buildCard()]} onSubmitReview={vi.fn()} />);
    expect(screen.getByAltText('Gợi ý')).toBeInTheDocument();
    expect(screen.queryByText('Con mèo đang ngủ.')).not.toBeInTheDocument();
  });

  it('shows a plain wrong hint (no diff) for the first two wrong attempts, then Hard on the correct 3rd try', async () => {
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard()]} onSubmitReview={onSubmitReview} />);
    const submit = () => fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong one'}});
    submit();
    expect(await screen.findByText('Sai rồi, thử lại.')).toBeInTheDocument();
    expect(screen.queryByTestId('character-diff-user-row')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong two'}});
    submit();
    expect(await screen.findByText('Sai rồi, thử lại.')).toBeInTheDocument();
    expect(screen.queryByTestId('character-diff-user-row')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'The cat sleeps.'}});
    submit();

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Hard'));
  });

  it('reveals the diff and rates Again after the 3rd wrong attempt, advancing on continue', async () => {
    const cards = [buildCard(), buildCard({id: 'sentence-2', englishSentence: 'Dogs bark.'})];
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={cards} onSubmitReview={onSubmitReview} />);
    const submit = () => fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong one'}});
    submit();
    await screen.findByText('Sai rồi, thử lại.');

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong two'}});
    submit();
    await screen.findByText('Sai rồi, thử lại.');

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong three'}});
    submit();

    expect(await screen.findByTestId('character-diff-user-row')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Tiếp tục'}));

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Again'));
    await waitFor(() => expect(screen.getByText('Câu 2 / 2')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/SentenceReviewView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `SentenceReviewView`**

Create `src/components/SentenceReviewView.tsx`:

```tsx
import React, {useState} from 'react';
import {SentenceCard} from '../types';
import type {AutomaticRating} from '../features/scheduling/automaticRating';
import {deriveSentenceRating} from '../features/scheduling/sentenceRating';
import {normalizeText} from '../utils/charDiff';
import {CharacterDiffComparison} from './CharacterDiffComparison';

interface SentenceReviewViewProps {
  sentenceCards: SentenceCard[];
  onSubmitReview: (cardId: string, rating: AutomaticRating) => Promise<boolean>;
}

function pickPromptKind(): 'image' | 'vietnamese' {
  return Math.random() < 0.5 ? 'image' : 'vietnamese';
}

export const SentenceReviewView: React.FC<SentenceReviewViewProps> = ({
  sentenceCards,
  onSubmitReview,
}) => {
  const [queue] = useState(() => sentenceCards
    .filter((card) => Date.parse(card.nextReviewDate) <= Date.now())
    .sort((a, b) => Date.parse(a.nextReviewDate) - Date.parse(b.nextReviewDate)));
  const [index, setIndex] = useState(0);
  const [promptKind, setPromptKind] = useState<'image' | 'vietnamese'>(pickPromptKind);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showWrongHint, setShowWrongHint] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const card = queue[index];

  const advance = () => {
    setIndex((current) => current + 1);
    setPromptKind(pickPromptKind());
    setTypedAnswer('');
    setWrongAttempts(0);
    setShowWrongHint(false);
    setShowDiff(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!card || showDiff || isSubmitting) return;

    const isCorrect = normalizeText(typedAnswer) === normalizeText(card.englishSentence);
    setIsSubmitting(true);
    try {
      if (isCorrect) {
        await onSubmitReview(card.id, deriveSentenceRating(wrongAttempts));
        advance();
        return;
      }

      const nextWrongAttempts = wrongAttempts + 1;
      setWrongAttempts(nextWrongAttempts);
      if (nextWrongAttempts >= 3) {
        setShowDiff(true);
      } else {
        setShowWrongHint(true);
        setTypedAnswer('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueAfterDiff = async () => {
    if (!card) return;
    setIsSubmitting(true);
    try {
      await onSubmitReview(card.id, 'Again');
      advance();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!card) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-2">
        <h2 className="text-xl font-bold text-slate-900">Không còn câu nào cần ôn tập.</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Câu {index + 1} / {queue.length}
      </p>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
        {promptKind === 'image' ? (
          <img
            src={card.imageUrl}
            alt="Gợi ý"
            className="w-full max-h-64 rounded-2xl object-contain bg-slate-50"
          />
        ) : (
          <p className="text-xl font-semibold text-slate-900 text-center">
            {card.vietnameseSentence}
          </p>
        )}

        {showDiff ? (
          <div className="space-y-4">
            <CharacterDiffComparison userInput={typedAnswer} expectedInput={card.englishSentence} />
            <button
              type="button"
              onClick={() => void handleContinueAfterDiff()}
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
            >
              Tiếp tục
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
            <label htmlFor="sentence-answer" className="text-xs font-bold text-slate-700">
              Viết lại câu tiếng Anh
            </label>
            <input
              id="sentence-answer"
              type="text"
              value={typedAnswer}
              onChange={(event) => {
                setTypedAnswer(event.target.value);
                setShowWrongHint(false);
              }}
              autoFocus
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
            {showWrongHint && (
              <p role="alert" className="text-sm text-rose-700">Sai rồi, thử lại.</p>
            )}
            <button
              type="submit"
              disabled={!typedAnswer.trim() || isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
            >
              Kiểm tra
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SentenceReviewView.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/SentenceReviewView.tsx src/components/SentenceReviewView.test.tsx
git commit -m "feat: add SentenceReviewView study session with FSRS grading"
```

---

## Task 8: Navigation — relabel and add the review tab

**Files:**
- Modify: `src/components/Navbar.tsx:1-16` (icon imports), `:60-61` (nav item list)
- Test: `src/components/Navbar.test.tsx` (check first; add a case only if none covers nav labels)

**Interfaces:**
- Consumes: nothing new.
- Produces: nav item ids stay `add_word` and `vocabulary` (unchanged, so no other file's routing breaks) — only their `label` changes. New id `sentence_review` is added, consumed by `App.tsx` (Task 9).

- [ ] **Step 1: Check for existing label assertions**

Run: `grep -n "Thêm từ mới\|Thư viện từ vựng" src/components/Navbar.test.tsx`
If it prints matches, note the line numbers — they'll need the same rename as Step 3 below.

- [ ] **Step 2: Import the `Type` icon**

In `src/components/Navbar.tsx`, add `Type` to the existing `lucide-react` import list (the block starting `import { LayoutDashboard, ... } from 'lucide-react';`).

- [ ] **Step 3: Relabel and add the nav item**

In `src/components/Navbar.tsx`, change:

```ts
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'learn', label: 'Học ngay', icon: GraduationCap },
    { id: 'rootword', label: 'Gốc từ & Morphology', icon: BrainCircuit },
    { id: 'vocabulary', label: 'Thư viện từ vựng', icon: BookOpen },
    { id: 'decks_tags', label: 'Deck & Tags', icon: FolderTree },
    { id: 'add_word', label: 'Thêm từ mới', icon: PlusCircle },
```

to:

```ts
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'learn', label: 'Học ngay', icon: GraduationCap },
    { id: 'sentence_review', label: 'Ôn tập câu', icon: Type },
    { id: 'rootword', label: 'Gốc từ & Morphology', icon: BrainCircuit },
    { id: 'vocabulary', label: 'Data', icon: BookOpen },
    { id: 'decks_tags', label: 'Deck & Tags', icon: FolderTree },
    { id: 'add_word', label: 'Add data', icon: PlusCircle },
```

- [ ] **Step 4: Fix any test that clicked the old labels**

If Step 1 found matches in `Navbar.test.tsx`, update them to the new labels. Also fix `src/App.test.tsx:396`:

```ts
    fireEvent.click(await screen.findByText('Thêm từ mới'));
```
→
```ts
    fireEvent.click(await screen.findByText('Add data'));
```

- [ ] **Step 5: Run the nav test**

Run: `npx vitest run src/components/Navbar.test.tsx`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/Navbar.tsx src/components/Navbar.test.tsx src/App.test.tsx
git commit -m "feat: relabel Add data / Data nav items and add sentence review tab"
```

---

## Task 9: Wire everything into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes everything produced by Tasks 2, 3, 4, 5, 6, 7: `SentenceCard`, `SentenceCardInput`, `loadSentenceCards`, `createSentenceCard`, `updateSentenceCard`, `deleteSentenceCard`, `submitSentenceReview`, `deriveSentenceRating` (indirectly, inside `SentenceReviewView`), `SubTabToggle`, `AddSentenceForm`, `SentenceLibraryView`, `SentenceReviewView`.
- Produces: nothing new for other files — this is the final integration point.

- [ ] **Step 1: Add imports**

Near the top of `src/App.tsx`, alongside the existing persistence/component imports, add:

```ts
import {
  createSentenceCard,
  deleteSentenceCard,
  loadSentenceCards,
  submitSentenceReview,
  updateSentenceCard,
  type SentenceCardInput,
} from './features/persistence/sentenceRepository';
import type {AutomaticRating} from './features/scheduling/automaticRating';
import {AddSentenceForm} from './components/AddSentenceForm';
import {SentenceLibraryView} from './components/SentenceLibraryView';
import {SentenceReviewView} from './components/SentenceReviewView';
import {SubTabToggle} from './components/SubTabToggle';
```

Add `SentenceCard` to the existing `import {..., Word, ...} from './types';` line (wherever `Word`/`Deck`/`Tag` are already imported from `./types`).

- [ ] **Step 2: Add state**

Near the other `useState` declarations in `App.tsx` (alongside `const [words, setWords] = useState...`), add:

```ts
const [sentenceCards, setSentenceCards] = useState<SentenceCard[]>([]);
const [addDataSubTab, setAddDataSubTab] = useState<'word' | 'sentence'>('word');
const [dataLibrarySubTab, setDataLibrarySubTab] = useState<'word' | 'sentence'>('word');
```

- [ ] **Step 3: Load sentence cards on hydration**

In the hydration `useEffect` (the one that calls `loadLearnerState` and resets `words`/`decks`/etc. — around `App.tsx:169-183`), add `setSentenceCards([]);` next to the other `set*([])` resets, and add a parallel load call next to the existing `void listResumableCsvImports(user.id).then(...)` call:

```ts
void loadSentenceCards(user.id).then((result) => {
  if (alive && result.data) setSentenceCards(result.data);
});
```

- [ ] **Step 4: Add sentence card handlers**

Near `handleDeleteWord` in `App.tsx`, add:

```ts
const handleCreateSentenceCard = async (input: SentenceCardInput): Promise<boolean> => {
  if (!client || !user) return false;
  const result = await createSentenceCard(user.id, input);
  if (result.error || !result.data) {
    showToast(result.error ?? 'Không thể lưu câu.');
    return false;
  }
  setSentenceCards((prev) => [result.data as SentenceCard, ...prev]);
  showToast('Đã thêm câu mới.');
  return true;
};

const handleUpdateSentenceCard = async (
  id: string,
  input: SentenceCardInput,
): Promise<boolean> => {
  if (!client || !user) return false;
  const existing = sentenceCards.find((card) => card.id === id);
  const result = await updateSentenceCard(user.id, id, input);
  if (result.error || !result.data) {
    showToast(result.error ?? 'Không thể lưu câu.');
    return false;
  }
  if (existing && existing.imageObjectKey !== input.imageObjectKey) {
    await deleteWordImage(existing.imageObjectKey);
  }
  const updated = result.data;
  setSentenceCards((prev) => prev.map((card) => (card.id === id ? updated : card)));
  showToast('Đã cập nhật câu.');
  return true;
};

const handleDeleteSentenceCard = async (card: SentenceCard): Promise<boolean> => {
  if (!window.confirm(`Xoá vĩnh viễn câu "${card.englishSentence}"? Không thể khôi phục.`)) {
    return false;
  }
  if (!client || !user) return false;
  const result = await deleteSentenceCard(user.id, card.id);
  if (result.error) {
    showToast(result.error);
    return false;
  }
  await deleteWordImage(card.imageObjectKey);
  setSentenceCards((prev) => prev.filter(({id}) => id !== card.id));
  showToast(`Đã xoá câu "${card.englishSentence}".`);
  return true;
};

const handleSubmitSentenceReview = async (
  cardId: string,
  rating: AutomaticRating,
): Promise<boolean> => {
  if (!client || !user) return false;
  const result = await submitSentenceReview(user.id, cardId, rating, new Date());
  if (result.error || !result.data) {
    showToast(result.error ?? 'Không thể lưu kết quả ôn tập.');
    return false;
  }
  const updated = result.data;
  setSentenceCards((prev) => prev.map((card) => (card.id === cardId ? updated : card)));
  return true;
};
```

`deleteWordImage` is already imported in `App.tsx` (used by `handleDeleteWord`) — no new import needed for it.

- [ ] **Step 5: Replace the `add_word` tab block**

Find the existing block (around `App.tsx:930`):

```tsx
          {currentTab === 'add_word' && (
            <AddWordModal
              decks={decks}
              tags={tags}
              globalWords={globalWords}
              linkedGlobalWords={words
                .filter(({isGlobal}) => isGlobal)
                .map(({id, word, ipa}) => ({id, word, ipa}))
              }
              aiSettings={{
                aiProvider: settings.aiProvider,
                geminiApiKey: settings.geminiApiKey,
                openAICompatibleTokenConfigured:
                  settings.openAICompatibleTokenConfigured,
              }}
              onAddWord={async (newWord) => {
                return handleAddWord(newWord);
              }}
              onLinkExistingGlobalWord={async (id) => {
                return handleLinkExistingGlobalWord(id);
              }}
              onClose={() => setCurrentTab('vocabulary')}
            />
          )}
```

Replace with (keeping every `AddWordModal` prop exactly as-is, just wrapped):

```tsx
          {currentTab === 'add_word' && (
            <>
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                <SubTabToggle
                  options={[{id: 'word', label: 'Từ vựng'}, {id: 'sentence', label: 'Câu'}]}
                  activeId={addDataSubTab}
                  onSelect={(id) => setAddDataSubTab(id as 'word' | 'sentence')}
                />
              </div>
              {addDataSubTab === 'word' ? (
                <AddWordModal
                  decks={decks}
                  tags={tags}
                  globalWords={globalWords}
                  linkedGlobalWords={words
                    .filter(({isGlobal}) => isGlobal)
                    .map(({id, word, ipa}) => ({id, word, ipa}))
                  }
                  aiSettings={{
                    aiProvider: settings.aiProvider,
                    geminiApiKey: settings.geminiApiKey,
                    openAICompatibleTokenConfigured:
                      settings.openAICompatibleTokenConfigured,
                  }}
                  onAddWord={async (newWord) => {
                    return handleAddWord(newWord);
                  }}
                  onLinkExistingGlobalWord={async (id) => {
                    return handleLinkExistingGlobalWord(id);
                  }}
                  onClose={() => setCurrentTab('vocabulary')}
                />
              ) : (
                <AddSentenceForm
                  onSave={handleCreateSentenceCard}
                  onClose={() => setCurrentTab('vocabulary')}
                />
              )}
            </>
          )}
```

- [ ] **Step 6: Replace the `vocabulary` tab block**

Find the existing block (around `App.tsx:970`):

```tsx
          {currentTab === 'vocabulary' && (
            <VocabularyLibraryView
              words={words}
              decks={decks}
              tags={tags}
              initialMemoryFilter={vocabularyMemoryFilter}
              onOpenAddWordModal={() => setCurrentTab('add_word')}
              onOpenWordDetail={(w) => setSelectedWordDetail(w)}
              onUpdateWordStatus={handleUpdateWordStatus}
              onBulkUpdateStatus={handleBulkUpdateStatus}
              onBulkMoveDeck={handleMoveWords}
              onDeleteWord={handleDeleteWord}
            />
          )}
```

Replace with:

```tsx
          {currentTab === 'vocabulary' && (
            <>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                <SubTabToggle
                  options={[{id: 'word', label: 'Từ vựng'}, {id: 'sentence', label: 'Câu'}]}
                  activeId={dataLibrarySubTab}
                  onSelect={(id) => setDataLibrarySubTab(id as 'word' | 'sentence')}
                />
              </div>
              {dataLibrarySubTab === 'word' ? (
                <VocabularyLibraryView
                  words={words}
                  decks={decks}
                  tags={tags}
                  initialMemoryFilter={vocabularyMemoryFilter}
                  onOpenAddWordModal={() => setCurrentTab('add_word')}
                  onOpenWordDetail={(w) => setSelectedWordDetail(w)}
                  onUpdateWordStatus={handleUpdateWordStatus}
                  onBulkUpdateStatus={handleBulkUpdateStatus}
                  onBulkMoveDeck={handleMoveWords}
                  onDeleteWord={handleDeleteWord}
                />
              ) : (
                <SentenceLibraryView
                  sentenceCards={sentenceCards}
                  onEditSentenceCard={handleUpdateSentenceCard}
                  onDeleteSentenceCard={handleDeleteSentenceCard}
                />
              )}
            </>
          )}
```

- [ ] **Step 7: Add the `sentence_review` tab block**

Directly after the `{currentTab === 'learn' && (...)}` block, add:

```tsx
          {currentTab === 'sentence_review' && (
            <SentenceReviewView
              sentenceCards={sentenceCards}
              onSubmitReview={handleSubmitSentenceReview}
            />
          )}
```

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. Fix any test broken by the label/structure change (the `App.test.tsx:396` fix from Task 8 should already cover the one known case — search the failures for any other place that clicks `'Thêm từ mới'` or `'Thư viện từ vựng'` by text, and update those strings the same way).

- [ ] **Step 9: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 10: Manual smoke check**

Run: `npm run dev`, then in the browser:
- Click "Add data" → confirm the "Từ vựng" tab shows the existing add-word form, click "Câu" → confirm the new image/EN/VN form appears.
- Add one sentence card, then click "Data" → "Câu" → confirm it's listed, edit it, delete it.
- Click "Ôn tập câu" with at least one due sentence card → confirm the prompt (image or Vietnamese, never both), type the wrong answer 3 times → confirm the diff view appears and "Tiếp tục" advances.

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire sentence cards into App.tsx (Add data, Data, and review tabs)"
```
