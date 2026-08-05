# FSRS Priority Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch — the user has explicitly requested no agent dispatch for this work). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework how a normal study session picks and sequences cards (tiered priority, minimum-card gate, question-variant padding) and replace the miss-triggered in-session reinsertion with an FSRS-schedule-driven one.

**Architecture:** All card-selection changes live in `sessionBuilder.ts` (pure function, easiest to unit test exhaustively). The reinsertion mechanism change is isolated to `LearningSessionView.tsx`. A single new time-window helper in `reviewCountdown.ts` is shared by both. `App.tsx` gets one new branch for the "not enough cards" message.

**Tech Stack:** TypeScript, React, Vitest + Testing Library (existing stack, no new dependencies).

## Global Constraints

- Short-term window threshold: **15 minutes** (covers both the `10m` and `15m` FSRS learning/relearning step profiles), used identically for tier B card selection and in-session reinsertion.
- Minimum **5** distinct Learning Cards (`meaningCard.id`) required to start a normal session; below that, no session starts.
- Sessions with 5-9 distinct cards are padded with repeated-card variants to reach **at least 10** questions total; 10+ cards get no padding.
- Round-robin distribution (`cardIndex = i % cardCount`) is the only distribution rule; repeated question types/content for the same card are acceptable, no dedup required.
- Reinsertion after a schedule landing within 15 minutes: insert 3 questions later (`currentIndex + 4`), clamp to the end of the queue if fewer than 3 remain, no cap on repeat count.
- None of this applies to Extra Review mode (`isExtraReview === true`) or `handlePracticeSingleWord` — both keep current behavior exactly.
- The old rule "critical reviews block new words" is removed.
- No new dependencies. No change to `fsrsScheduler.ts`, `automaticRating.ts`, or any Supabase migration/RPC.

---

### Task 1: Short-term window helper in `reviewCountdown.ts`

**Files:**
- Modify: `src/features/scheduling/reviewCountdown.ts`
- Test: `src/features/scheduling/reviewCountdown.test.ts`

**Interfaces:**
- Produces: `SHORT_TERM_WINDOW_MS: number` (= `15 * 60_000`) and `isReviewDueWithin(nextReviewDate: string | undefined, windowMs: number, now?: Date, timezone?: string): boolean` — both exported from `reviewCountdown.ts`. `isReviewDueWithin` returns `true` only when the card is **not yet due** (`now < nextReviewDate`) and the gap to `nextReviewDate` is `<= windowMs`. Consumed by Task 2 (`sessionBuilder.ts`) and Task 6 (`LearningSessionView.tsx`, via the same constant).

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/features/scheduling/reviewCountdown.test.ts` (keep the existing `import` line, add `isReviewDueWithin` to it):

```ts
import {findNextReview, formatReviewCountdown, isReviewDue, isReviewDueWithin} from './reviewCountdown';
```

```ts
describe('isReviewDueWithin', () => {
  const now = new Date('2026-07-31T05:00:00.000Z');
  const windowMs = 15 * 60_000;

  it('is false for a card already due', () => {
    expect(isReviewDueWithin('2026-07-31T04:59:00.000Z', windowMs, now)).toBe(false);
  });

  it('is true for a card due in 10 minutes', () => {
    expect(isReviewDueWithin('2026-07-31T05:10:00.000Z', windowMs, now)).toBe(true);
  });

  it('is true for a card due exactly at the 15-minute boundary', () => {
    expect(isReviewDueWithin('2026-07-31T05:15:00.000Z', windowMs, now)).toBe(true);
  });

  it('is false for a card due just past the window', () => {
    expect(isReviewDueWithin('2026-07-31T05:15:01.000Z', windowMs, now)).toBe(false);
  });

  it('is false when there is no next review date', () => {
    expect(isReviewDueWithin(undefined, windowMs, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/scheduling/reviewCountdown.test.ts`
Expected: FAIL — `isReviewDueWithin` is not exported yet.

- [ ] **Step 3: Implement**

In `src/features/scheduling/reviewCountdown.ts`, add after the `HOUR` constant:

```ts
export const SHORT_TERM_WINDOW_MS = 15 * 60_000;
```

Add after `isReviewDue`'s definition (same file, exported function):

```ts
export function isReviewDueWithin(
  nextReviewDate: string | undefined,
  windowMs: number,
  now = new Date(),
  timezone = 'Asia/Ho_Chi_Minh',
): boolean {
  const target = parseReviewDate(nextReviewDate, timezone);
  if (!target) return false;
  const msUntilDue = target.getTime() - now.getTime();
  return msUntilDue > 0 && msUntilDue <= windowMs;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/scheduling/reviewCountdown.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduling/reviewCountdown.ts src/features/scheduling/reviewCountdown.test.ts
git commit -m "feat: add isReviewDueWithin short-term window helper"
```

---

### Task 2: Tiered review sort in `sessionBuilder.ts` (removes the new-word-blocking rule)

**Files:**
- Modify: `src/utils/sessionBuilder.ts`
- Test: `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Consumes: `isReviewDueWithin`, `SHORT_TERM_WINDOW_MS` from Task 1.
- Produces: no new exports; `buildSessionQuestions`'s review ordering now follows tier A (critical) → tier B (due within `SHORT_TERM_WINDOW_MS`) → tier C (already due, not critical). New words are no longer blocked when a critical review exists. Test helpers `fillerReviewWords(count, scoreStart?)` and `realIds(session)` are added to `sessionBuilder.test.ts` and reused by Tasks 3 and 4.

- [ ] **Step 1: Add test helpers and write the failing tests**

At the top of `src/utils/sessionBuilder.test.ts`, after the existing `word()` factory function, add:

```ts
function fillerReviewWords(count: number, scoreStart = 900): Word[] {
  return Array.from({ length: count }, (_, i) =>
    word(`filler-${i}`, [meaningCard(`filler-${i}`, {
      memoryStrength: 'stable',
      memoryScore: scoreStart + i,
      nextReviewDate: '2000-01-01',
    })]),
  );
}

function realIds(session: { questions: { word: { id: string } }[] }): string[] {
  return session.questions.map((q) => q.word.id).filter((id) => !id.startsWith('filler-'));
}
```

Replace the existing test `'does not add new cards when a critical review is due'` with:

```ts
  it('still includes new cards when a critical review is due', () => {
    const words = [
      word('critical', [
        meaningCard('critical', {
          memoryStrength: 'critical',
          memoryScore: 10,
          nextReviewDate: '2000-01-01',
        }),
      ]),
      word('new', [meaningCard('new', { history: [] })]),
      ...fillerReviewWords(8),
    ];

    const session = buildSessionQuestions(words, scope, settings);
    const ids = session.questions.map((q) => q.word.id);

    expect(ids).toContain('critical');
    expect(ids).toContain('new');
  });
```

Replace the existing test `'orders due reviews by lower memory score first'` with:

```ts
  it('orders due reviews by lower memory score first', () => {
    const words = [
      word('high', [meaningCard('high', { nextReviewDate: '2000-01-01', memoryScore: 80 })]),
      word('low', [meaningCard('low', { nextReviewDate: '2000-01-01', memoryScore: 10 })]),
      word('middle', [meaningCard('middle', { nextReviewDate: '2000-01-01', memoryScore: 50 })]),
      ...fillerReviewWords(7),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(realIds(session)).toEqual(['low', 'middle', 'high']);
  });
```

Add a new test block right after it:

```ts
  it('ranks critical, then due-within-15-minutes, then ordinary due reviews', () => {
    const now = new Date('2026-08-05T05:00:00.000Z');
    const words = [
      word('ordinary-due', [meaningCard('ordinary-due', {
        memoryStrength: 'stable',
        memoryScore: 60,
        nextReviewDate: '2026-08-04T00:00:00.000Z',
      })]),
      word('near-due', [meaningCard('near-due', {
        fsrsState: 2,
        memoryStrength: 'stable',
        memoryScore: 60,
        nextReviewDate: '2026-08-05T05:10:00.000Z',
      })]),
      word('critical', [meaningCard('critical', {
        memoryStrength: 'critical',
        memoryScore: 10,
        nextReviewDate: '2026-08-05T04:00:00.000Z',
      })]),
      ...fillerReviewWords(7),
    ];

    const session = buildSessionQuestions(words, scope, settings, false, undefined);
    void now; // documents the instant these fixtures were designed around

    expect(realIds(session)).toEqual(['critical', 'near-due', 'ordinary-due']);
  });

  it('orders same-tier due-within-15-minutes cards by soonest due first', () => {
    const words = [
      word('due-in-12', [meaningCard('due-in-12', {
        fsrsState: 2,
        memoryStrength: 'stable',
        nextReviewDate: new Date(Date.now() + 12 * 60_000).toISOString(),
      })]),
      word('due-in-3', [meaningCard('due-in-3', {
        fsrsState: 2,
        memoryStrength: 'stable',
        nextReviewDate: new Date(Date.now() + 3 * 60_000).toISOString(),
      })]),
      ...fillerReviewWords(8),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(realIds(session)).toEqual(['due-in-3', 'due-in-12']);
  });
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npx vitest run src/utils/sessionBuilder.test.ts`
Expected: FAIL for `'still includes new cards when a critical review is due'` (new words are currently blocked), `'ranks critical, then due-within-15-minutes...'` (near-due cards aren't picked up at all today), and `'orders same-tier due-within-15-minutes...'` (same reason). `'orders due reviews by lower memory score first'` should already pass (filler cards sort after by score) — if it fails, re-check `fillerReviewWords`' scores are indeed higher than 80.

- [ ] **Step 3: Implement the tier sort and remove the blocking rule**

In `src/utils/sessionBuilder.ts`, change the import line:

```ts
import {isReviewDue} from '../features/scheduling/reviewCountdown';
```
to:
```ts
import {isReviewDue, isReviewDueWithin, SHORT_TERM_WINDOW_MS} from '../features/scheduling/reviewCountdown';
```

Change the `forEach` inclusion condition from:

```ts
      if (isFsrsNew) {
        newCards.push({ word, meaningCard, isNewWord: true, stage: 1 });
      } else if (
        isDue
        || meaningCard.memoryStrength === 'critical'
        || isExtraReview
      ) {
        reviewCards.push({ word, meaningCard, isNewWord: false, stage });
      }
```
to:
```ts
      const isNearDueSoon = !isDue
        && isReviewDueWithin(meaningCard.nextReviewDate, SHORT_TERM_WINDOW_MS, now, 'Asia/Ho_Chi_Minh');

      if (isFsrsNew) {
        newCards.push({ word, meaningCard, isNewWord: true, stage: 1 });
      } else if (
        isDue
        || meaningCard.memoryStrength === 'critical'
        || isNearDueSoon
        || isExtraReview
      ) {
        reviewCards.push({ word, meaningCard, isNewWord: false, stage });
      }
```

Replace the whole block from the `// 2. Priority Sorting for Reviews:` comment down through the `let selectedNew: SessionQueueItem[] = [];` / `if (criticalReviews.length === 0) { ... }` lines — i.e. replace:

```ts
  // 2. Priority Sorting for Reviews:
  // Order: Overdue -> Critical Strength -> Weak Strength -> Due today
  reviewCards.sort((a, b) => {
    const hasTelemetry = a.meaningCard.recognitionScore !== undefined
      || a.meaningCard.recallScore !== undefined
      || a.meaningCard.spellingScore !== undefined
      || a.meaningCard.contextScore !== undefined
      || a.meaningCard.wordStructureScore !== undefined;
    if (!hasTelemetry) {
      return (a.meaningCard.memoryScore || 50) - (b.meaningCard.memoryScore || 50);
    }
    return calculateForgettingRisk(b.meaningCard) - calculateForgettingRisk(a.meaningCard);
  });

  const criticalReviews = reviewCards.filter(
    (item) => item.meaningCard.memoryStrength === 'critical'
  );

  // If Extra Review Mode: only pick at-risk / critical words
  if (isExtraReview) {
    const atRiskCards = reviewCards.filter(
      (c) => c.meaningCard.memoryStrength === 'critical' || c.meaningCard.memoryStrength === 'weak'
    );
    const selected = enforceWordSpacing(atRiskCards.slice(0, settings.reviewLimitPerDay));
    return {
      questions: convertQueueToQuestions(selected, words),
      totalAvailableReviews: atRiskCards.length,
      limitReached: false,
    };
  }

  // Enforce Review Limit Per Day
  const reviewLimit = settings.reviewLimitPerDay || 40;
  const newWordsLimit = newWordsLimitOverride ?? (settings.newWordsPerDay || 10);

  const totalAvailableReviews = reviewCards.length;
  const selectedReviews = reviewCards.slice(0, reviewLimit);
  const limitReached = reviewCards.length > reviewLimit;

  // Rule from section 6: If critical reviews exist, do NOT include new words in session!
  let selectedNew: SessionQueueItem[] = [];
  if (criticalReviews.length === 0) {
    selectedNew = newCards.slice(0, newWordsLimit);
  }
```

with:

```ts
  const legacyRiskCompare = (a: SessionQueueItem, b: SessionQueueItem) => {
    const hasTelemetry = a.meaningCard.recognitionScore !== undefined
      || a.meaningCard.recallScore !== undefined
      || a.meaningCard.spellingScore !== undefined
      || a.meaningCard.contextScore !== undefined
      || a.meaningCard.wordStructureScore !== undefined;
    if (!hasTelemetry) {
      return (a.meaningCard.memoryScore || 50) - (b.meaningCard.memoryScore || 50);
    }
    return calculateForgettingRisk(b.meaningCard) - calculateForgettingRisk(a.meaningCard);
  };

  // If Extra Review Mode: only pick at-risk / critical words. Keeps the
  // original single-criterion sort — tiering below is a normal-session-only
  // concept and would misclassify far-future extra-review candidates.
  if (isExtraReview) {
    reviewCards.sort(legacyRiskCompare);
    const atRiskCards = reviewCards.filter(
      (c) => c.meaningCard.memoryStrength === 'critical' || c.meaningCard.memoryStrength === 'weak'
    );
    const selected = enforceWordSpacing(atRiskCards.slice(0, settings.reviewLimitPerDay));
    return {
      questions: convertQueueToQuestions(selected, words),
      totalAvailableReviews: atRiskCards.length,
      limitReached: false,
      insufficientCards: false,
    };
  }

  // 2. Priority tiers for reviews:
  //   A) critical strength, B) due within the short-term FSRS window,
  //   C) everything else already due. Each tier keeps its own ordering.
  const reviewTier = (item: SessionQueueItem): 0 | 1 | 2 => {
    if (item.meaningCard.memoryStrength === 'critical') return 0;
    if (!isReviewDue(item.meaningCard.nextReviewDate, now, 'Asia/Ho_Chi_Minh')) return 1;
    return 2;
  };

  reviewCards.sort((a, b) => {
    const tierDiff = reviewTier(a) - reviewTier(b);
    if (tierDiff !== 0) return tierDiff;
    if (reviewTier(a) === 1) {
      return new Date(a.meaningCard.nextReviewDate!).getTime()
        - new Date(b.meaningCard.nextReviewDate!).getTime();
    }
    return legacyRiskCompare(a, b);
  });

  // Enforce Review Limit Per Day
  const reviewLimit = settings.reviewLimitPerDay || 40;
  const newWordsLimit = newWordsLimitOverride ?? (settings.newWordsPerDay || 10);

  const totalAvailableReviews = reviewCards.length;
  const selectedReviews = reviewCards.slice(0, reviewLimit);
  const limitReached = reviewCards.length > reviewLimit;

  const selectedNew = newCards.slice(0, newWordsLimit);
```

Update the return type and both remaining `return` statements to add `insufficientCards: false` for now (Task 3 will make it conditional):

```ts
export function buildSessionQuestions(
  words: Word[],
  studyScope: StudyScope,
  settings: UserSettings,
  isExtraReview: boolean = false,
  newWordsLimitOverride?: number,
): { questions: Question[]; totalAvailableReviews: number; limitReached: boolean; insufficientCards: boolean } {
```

And the function's final `return`:

```ts
  return {
    questions,
    totalAvailableReviews,
    limitReached,
    insufficientCards: false,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/sessionBuilder.test.ts`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionBuilder.ts src/utils/sessionBuilder.test.ts
git commit -m "feat: tier review priority by critical, near-due, then due; stop blocking new words"
```

---

### Task 3: Minimum 5-distinct-card gate in `sessionBuilder.ts`

**Files:**
- Modify: `src/utils/sessionBuilder.ts`
- Test: `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Produces: `buildSessionQuestions(...).insufficientCards` becomes `true` (with `questions: []`) whenever the normal-session path selects fewer than 5 distinct cards. Consumed by Task 5 (`App.tsx`).

- [ ] **Step 1: Write the failing tests, and pad every existing test that has fewer than 10 distinct qualifying cards**

Add two new tests to `src/utils/sessionBuilder.test.ts` (anywhere inside the top-level `describe` block):

```ts
  it('reports insufficientCards and no questions when fewer than 5 distinct cards qualify', () => {
    const words = [
      word('one', [meaningCard('one', { nextReviewDate: '2000-01-01' })]),
      word('two', [meaningCard('two', { nextReviewDate: '2000-01-01' })]),
      word('three', [meaningCard('three', { nextReviewDate: '2000-01-01' })]),
    ];

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toEqual([]);
    expect(session.insufficientCards).toBe(true);
  });

  it('does not report insufficientCards once at least 5 distinct cards qualify', () => {
    const words = fillerReviewWords(5);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.insufficientCards).toBe(false);
    expect(session.questions.length).toBeGreaterThan(0);
  });
```

Now pad the following existing tests so their real qualifying-card count reaches 10 (avoiding the new gate at this task, and avoiding Task 4's padding range so their assertions stay exact). For each, the only change is adding `...fillerReviewWords(N)` to the `words` array and switching the assertion to use `realIds(session)` or `.find(...)` instead of raw indexing, exactly as shown:

Replace `'includes an already-started critical card before its due time in a normal session'` with:

```ts
  it('includes an already-started critical card before its due time in a normal session', () => {
    const criticalCard = meaningCard('critical-future', {
      fsrsState: 2,
      memoryStrength: 'critical',
      memoryScore: 10,
      nextReviewDate: '2099-01-01T00:00:00.000Z',
    });

    const session = buildSessionQuestions(
      [word('critical-future', [criticalCard]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    expect(session.questions).toHaveLength(10);
    expect(session.questions[0].word.id).toBe('critical-future');
    expect(session.questions[0].isNewWord).toBe(false);
    expect(session.totalAvailableReviews).toBe(10);
  });
```

Replace `'includes persisted non-new FSRS cards even when legacy history is empty'` with:

```ts
  it('includes persisted non-new FSRS cards even when legacy history is empty', () => {
    const scheduledCard = meaningCard('scheduled', {
      fsrsState: 2,
      history: [],
      lastReviewedDate: undefined,
      nextReviewDate: '2000-01-01T00:00:00.000Z',
    });

    const session = buildSessionQuestions(
      [word('scheduled', [scheduledCard]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    expect(realIds(session)).toEqual(['scheduled']);
    const target = session.questions.find((q) => q.word.id === 'scheduled');
    expect(target?.isNewWord).toBe(false);
    expect(session.totalAvailableReviews).toBe(10);
  });
```

Replace `'treats FSRS state 0 as new even when legacy history exists'` with:

```ts
  it('treats FSRS state 0 as new even when legacy history exists', () => {
    const newCard = meaningCard('new-fsrs-card', {
      fsrsState: 0,
      nextReviewDate: '2099-01-01',
    });

    const session = buildSessionQuestions(
      [word('new-fsrs-card', [newCard]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    const target = session.questions.find((q) => q.word.id === 'new-fsrs-card');
    expect(target?.isNewWord).toBe(true);
  });
```

Replace `'uses only multiple-choice questions before new learners are asked to type'` with:

```ts
  it('uses only multiple-choice questions before new learners are asked to type', () => {
    const ids = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const words = ids.map((id) =>
      word(id, [meaningCard(id, {
        fsrsState: 0,
        history: [],
        exampleSentences: [{
          id: `example-${id}`,
          meaningCardId: id,
          sentence: `This sentence contains ${id}.`,
          expectedAnswer: id,
          baseWord: id,
          wordForm: 'base',
          partOfSpeech: 'noun',
          difficulty: 'easy',
          approvalStatus: 'approved',
        }],
      })]),
    );

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(10);
    for (const [index, question] of session.questions.entries()) {
      expect(question.stage).toBe(1);
      expect(question.mcOptions?.length).toBeGreaterThan(0);
      expect(question.type).not.toBe('sentence_completion');
      expect(question.type).toBe(index % 2 === 0 ? 'en_to_vn_mc' : 'vn_to_en_mc');
    }
  });
```

Replace `'uses sentence completion at Stage 2 when word parts are unavailable'` with:

```ts
  it('uses sentence completion at Stage 2 when word parts are unavailable', () => {
    const card = meaningCard('new', {
      fsrsState: 2,
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
      exampleSentences: [{
        id: 'example-new',
        meaningCardId: 'new',
        sentence: 'Welcome to your new home!',
        expectedAnswer: 'new',
        baseWord: 'new',
        wordForm: 'base',
        partOfSpeech: 'adjective',
        difficulty: 'easy',
        approvalStatus: 'approved',
      }],
    });
    const session = buildSessionQuestions(
      [word('new', [card]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    const target = session.questions.find((q) => q.word.id === 'new');
    expect(target?.stage).toBe(2);
    expect(target?.type).toBe('sentence_completion');
    expect(target?.expectedAnswer).toBe('new');
  });
```

Replace `'falls back to full-word typing when a staged card has no word parts'` with:

```ts
  it('falls back to full-word typing when a staged card has no word parts', () => {
    const card = meaningCard('decide', {
      memoryStrength: 'stable',
      nextReviewDate: '2020-01-01',
    });
    const session = buildSessionQuestions(
      [word('decide', [card]), ...fillerReviewWords(9)],
      scope,
      settings,
    );

    const target = session.questions.find((q) => q.word.id === 'decide');
    expect(target?.stage).toBe(3);
    expect(target?.type).toBe('full_word_typing');
    expect(target?.wordParts).toEqual([]);
  });
```

Replace `'uses Vietnamese meaning for word-part selection and requires multiple parts'` with:

```ts
  it('uses Vietnamese meaning for word-part selection and requires multiple parts', () => {
    const compound = word('repair', [meaningCard('repair', {
      meaning: 'sửa chữa',
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
    })]);
    compound.wordStructure = [
      {id: 're', text: 're', type: 'prefix', order: 0},
      {id: 'pair', text: 'pair', type: 'root', order: 1},
    ];
    const compoundSession = buildSessionQuestions([compound, ...fillerReviewWords(9)], scope, settings);
    const compoundTarget = compoundSession.questions.find((q) => q.word.id === 'repair');
    expect(compoundTarget?.type).toBe('word_part_selection');
    expect(compoundTarget?.prompt).toContain('sửa chữa');
    expect(compoundTarget?.prompt).not.toContain('repair');

    const typingCard = meaningCard('typing', {
      meaning: 'đi vào',
      memoryStrength: 'stable',
      nextReviewDate: '2000-01-01',
    });
    const typingWord = word('come', [typingCard]);
    typingWord.wordStructure = [
      {id: 'com', text: 'com', type: 'root', order: 0},
      {id: 'e', text: 'e', type: 'suffix', order: 1},
    ];
    const typingSession = buildSessionQuestions([typingWord, ...fillerReviewWords(9)], scope, settings);
    const typingTarget = typingSession.questions.find((q) => q.word.id === 'come');
    expect(typingTarget?.type).toBe('word_part_typing');
    expect(typingTarget?.prompt).toContain('đi vào');
    expect(typingTarget?.prompt).not.toContain('come');

    const rootOnly = word('remain', [meaningCard('remain', {
      meaning: 'còn lại',
      memoryStrength: 'weak',
      nextReviewDate: '2000-01-01',
    })]);
    rootOnly.wordStructure = [{id: 'remain', text: 'remain', type: 'root', order: 0}];
    const rootOnlySession = buildSessionQuestions([rootOnly, ...fillerReviewWords(9)], scope, settings);
    const rootOnlyTarget = rootOnlySession.questions.find((q) => q.word.id === 'remain');
    expect(rootOnlyTarget?.type).toBe('full_word_typing');
  });
```

Replace `'filters out words outside the selected deck, excluded tags, and inactive statuses'` with:

```ts
  it('filters out words outside the selected deck, excluded tags, and inactive statuses', () => {
    const selectedDeckScope: StudyScope = {
      activeDeckIds: ['deck-1'],
      excludedTagIds: ['skip'],
      pausedWordIds: [],
    };
    const eligible = word('eligible', [meaningCard('eligible', { nextReviewDate: '2000-01-01' })]);
    const otherDeck = word('other-deck', [meaningCard('other-deck', { nextReviewDate: '2000-01-01' })]);
    otherDeck.deckId = 'deck-2';
    const excludedTag = word('excluded-tag', [meaningCard('excluded-tag', { nextReviewDate: '2000-01-01' })]);
    excludedTag.tags = ['skip'];
    const paused = word('paused', [meaningCard('paused', { nextReviewDate: '2000-01-01' })], 'paused');

    const session = buildSessionQuestions(
      [eligible, otherDeck, excludedTag, paused, ...fillerReviewWords(9)],
      selectedDeckScope,
      settings
    );
    const ids = session.questions.map((q) => q.word.id);

    expect(ids).toContain('eligible');
    expect(ids).not.toContain('other-deck');
    expect(ids).not.toContain('excluded-tag');
    expect(ids).not.toContain('paused');
    expect(ids).toHaveLength(10);
  });
```

Replace `'enforces review and new-word limits'` with:

```ts
  it('enforces review and new-word limits', () => {
    const limitedSettings = { ...settings, reviewLimitPerDay: 2, newWordsPerDay: 8 };
    const newIds = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    const words = [
      word('review-low', [meaningCard('review-low', { nextReviewDate: '2000-01-01', memoryScore: 10 })]),
      word('review-mid', [meaningCard('review-mid', { nextReviewDate: '2000-01-01', memoryScore: 20 })]),
      word('review-high', [meaningCard('review-high', { nextReviewDate: '2000-01-01', memoryScore: 30 })]),
      ...newIds.map((n) => word(`new-${n}`, [meaningCard(`new-${n}`, { history: [] })])),
    ];

    const session = buildSessionQuestions(words, scope, limitedSettings);

    expect(session.questions.map((question) => question.word.id)).toEqual([
      'review-low',
      'review-mid',
      'new-one', 'new-two', 'new-three', 'new-four', 'new-five', 'new-six', 'new-seven', 'new-eight',
    ]);
    expect(session.totalAvailableReviews).toBe(3);
    expect(session.limitReached).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify the new gate tests fail and the padded tests still pass**

Run: `npx vitest run src/utils/sessionBuilder.test.ts`
Expected: the two new gate tests FAIL (no `insufficientCards` gate exists yet); every padded test should already PASS unchanged (padding alone doesn't change today's behavior).

- [ ] **Step 3: Implement the gate**

In `src/utils/sessionBuilder.ts`, add a module-level constant near the top (after the imports, before `export interface SessionQueueItem`):

```ts
const MIN_DISTINCT_CARDS_FOR_SESSION = 5;
```

Insert this right after the `const selectedNew = newCards.slice(0, newWordsLimit);` line (before the `// Interleave 4 reviews per 1 new word if new words present` comment):

```ts
  if (selectedReviews.length + selectedNew.length < MIN_DISTINCT_CARDS_FOR_SESSION) {
    return {
      questions: [],
      totalAvailableReviews,
      limitReached,
      insufficientCards: true,
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/sessionBuilder.test.ts`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionBuilder.ts src/utils/sessionBuilder.test.ts
git commit -m "feat: gate session start on a minimum of 5 distinct learning cards"
```

---

### Task 4: Round-robin question-variant padding in `sessionBuilder.ts`

**Files:**
- Modify: `src/utils/sessionBuilder.ts`
- Test: `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Produces: when the final selected distinct-card count is in `[5, 9]`, `buildSessionQuestions` returns `max(10, cardCount)` questions built by round-robin repeating the tier-ordered cards (`cardIndex = i % cardCount`) through the existing unchanged `convertQueueToQuestions`. 10+ cards get exactly one question per card, unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/utils/sessionBuilder.test.ts`:

```ts
  it('pads a 6-card session to 10 questions by round-robin repeating cards', () => {
    const words = fillerReviewWords(6);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(10);
    const counts = session.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.word.id] = (acc[q.word.id] ?? 0) + 1;
      return acc;
    }, {});
    // i % 6 for i in 0..9 hits card indices 0,1,2,3 twice and 4,5 once.
    expect(Object.values(counts).sort()).toEqual([1, 1, 2, 2, 2, 2]);
  });

  it('does not pad a session that already has 10 or more distinct cards', () => {
    const words = fillerReviewWords(11);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(11);
    const ids = session.questions.map((q) => q.word.id);
    expect(new Set(ids).size).toBe(11);
  });

  it('pads a session that has exactly the minimum 5 distinct cards', () => {
    const words = fillerReviewWords(5);

    const session = buildSessionQuestions(words, scope, settings);

    expect(session.questions).toHaveLength(10);
    expect(new Set(session.questions.map((q) => q.word.id)).size).toBe(5);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/sessionBuilder.test.ts`
Expected: FAIL for all three new tests — `fillerReviewWords(6)`/`fillerReviewWords(5)` currently produce exactly 6/5 questions (no padding yet); `fillerReviewWords(11)` already passes coincidentally (no padding needed) but keep it as a regression guard.

- [ ] **Step 3: Implement the round-robin expansion**

In `src/utils/sessionBuilder.ts`, add the constant next to `MIN_DISTINCT_CARDS_FOR_SESSION`:

```ts
const MIN_QUESTIONS_PER_SESSION = 10;
```

Change:

```ts
  // 3. Spacing constraint: Spacing same word cards by at least 1 other question
  const spacedQueue = enforceWordSpacing(finalQueue);

  // 4. Convert queue items to interactive Question objects
  const questions = convertQueueToQuestions(spacedQueue, words);
```

to:

```ts
  // 3. Spacing constraint: Spacing same word cards by at least 1 other question
  const spacedQueue = enforceWordSpacing(finalQueue);

  // 4. Pad a small (5-9 card) session with round-robin repeated cards so it
  // has at least MIN_QUESTIONS_PER_SESSION questions. Repeats are spaced at
  // least spacedQueue.length apart, already satisfying enforceWordSpacing.
  const expandedQueue = spacedQueue.length < MIN_QUESTIONS_PER_SESSION
    ? expandQueueForVariants(spacedQueue, MIN_QUESTIONS_PER_SESSION)
    : spacedQueue;

  // 5. Convert queue items to interactive Question objects
  const questions = convertQueueToQuestions(expandedQueue, words);
```

Add the new helper function next to `enforceWordSpacing` (after its closing brace):

```ts
function expandQueueForVariants(
  queue: SessionQueueItem[],
  minQuestions: number,
): SessionQueueItem[] {
  if (queue.length === 0) return queue;
  const total = Math.max(minQuestions, queue.length);
  return Array.from({ length: total }, (_, i) => queue[i % queue.length]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/sessionBuilder.test.ts`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sessionBuilder.ts src/utils/sessionBuilder.test.ts
git commit -m "feat: pad small sessions to at least 10 questions via round-robin card repeats"
```

---

### Task 5: "Not enough cards" message in `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `buildSessionQuestions(...).insufficientCards` from Task 3; `findNextReview`, `formatReviewCountdown` from `src/features/scheduling/reviewCountdown.ts` (already used the same way in `DashboardView.tsx`).

- [ ] **Step 1: Write the failing tests**

Add to `src/App.test.tsx`, in a new `describe` block (place it after the `describe('App session creation concurrency', ...)` block):

```ts
describe('App insufficient-card session start', () => {
  it('shows a generic not-enough-cards message when fewer than 5 cards are already due', async () => {
    loadLearnerState.mockResolvedValue({
      data: {
        settings: INITIAL_SETTINGS,
        studyScope: INITIAL_STUDY_SCOPE,
        decks: INITIAL_DECKS,
        tags: INITIAL_TAGS,
        words: [
          {
            ...INITIAL_WORDS[0],
            id: 'only-word-1',
            meanings: [{
              ...INITIAL_WORDS[0].meanings[0],
              id: 'only-meaning-1',
              wordId: 'only-word-1',
              nextReviewDate: '2000-01-01',
              history: [],
            }],
          },
        ],
        globalWords: [],
      },
      error: null,
    });
    render(<App />);

    const startButton = await screen.findByRole('button', { name: 'Continue Learning' });
    fireEvent.click(startButton);

    expect(
      await screen.findByText(/Chưa đủ từ vựng cần học trong Study Scope hiện tại/),
    ).toBeInTheDocument();
  });

  it('shows a countdown when the not-enough-cards session has only future-due cards', async () => {
    const futureIso = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    loadLearnerState.mockResolvedValue({
      data: {
        settings: INITIAL_SETTINGS,
        studyScope: INITIAL_STUDY_SCOPE,
        decks: INITIAL_DECKS,
        tags: INITIAL_TAGS,
        words: [
          {
            ...INITIAL_WORDS[0],
            id: 'future-word-1',
            meanings: [{
              ...INITIAL_WORDS[0].meanings[0],
              id: 'future-meaning-1',
              wordId: 'future-word-1',
              fsrsState: 2,
              nextReviewDate: futureIso,
              history: [{
                id: 'h-future-1',
                date: '2026-07-01T00:00:00.000Z',
                stage: 1,
                isFirstAttemptCorrect: true,
                attemptsCount: 1,
                hintLevelUsed: 0,
                responseTimeMs: 1000,
                errorTypes: [],
              }],
            }],
          },
        ],
        globalWords: [],
      },
      error: null,
    });
    render(<App />);

    const startButton = await screen.findByRole('button', { name: 'Continue Learning' });
    fireEvent.click(startButton);

    expect(
      await screen.findByText(/Chưa đủ từ vựng cần học.*quay lại sau/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — today's message is `'Không có từ vựng nào cần học trong Study Scope hiện tại!'`, which doesn't match either new regex.

- [ ] **Step 3: Implement**

In `src/App.tsx`, add to the import from `./features/scheduling/reviewCountdown` — there isn't one yet, so add a new import line right after the `buildSessionQuestions` import:

```ts
import { buildSessionQuestions } from './utils/sessionBuilder';
```
becomes:
```ts
import { buildSessionQuestions } from './utils/sessionBuilder';
import { findNextReview, formatReviewCountdown } from './features/scheduling/reviewCountdown';
```

Change `handleStartLearning`'s body from:

```ts
    const {questions} = buildSessionQuestions(
      words,
      studyScope,
      settings,
      isExtraReview,
      newWordsLimitOverride,
    );
    if (questions.length === 0) {
      showToast('Không có từ vựng nào cần học trong Study Scope hiện tại!');
      return;
    }
    await activateLearningSession(questions, isExtraReview);
```

to:

```ts
    const {questions, insufficientCards} = buildSessionQuestions(
      words,
      studyScope,
      settings,
      isExtraReview,
      newWordsLimitOverride,
    );
    if (insufficientCards) {
      const countdown = findNextReview(words, new Date());
      showToast(
        countdown.kind === 'scheduled'
          ? `Chưa đủ từ vựng cần học trong Study Scope hiện tại — quay lại sau ${formatReviewCountdown(countdown)}.`
          : 'Chưa đủ từ vựng cần học trong Study Scope hiện tại (cần tối thiểu 5 card).',
      );
      return;
    }
    await activateLearningSession(questions, isExtraReview);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: show a countdown-aware message when a session lacks enough cards"
```

---

### Task 6: Replace miss-based reinsertion with FSRS-schedule-driven reinsertion

**Files:**
- Modify: `src/components/LearningSessionView.tsx`
- Test: `src/components/LearningSessionView.test.tsx`

**Interfaces:**
- Consumes: `SHORT_TERM_WINDOW_MS` from Task 1 (`reviewCountdown.ts`); the existing `ScheduledLearningCard` shape from `fsrsScheduler.ts` (`schedule.card.due: Date`).
- Produces: no new exports. A question whose resolved FSRS schedule (`schedule.card.due`) lands within `SHORT_TERM_WINDOW_MS` of `reviewedAt` is re-queued 3 questions later (`currentIndex + 4`, clamped to the queue length), with no cap on repeat count. The old `attemptsCount > 1` / `currentIndex + 5` / one-per-card-cap mechanism is removed entirely.

- [ ] **Step 1: Remove the old reinsertion tests**

In `src/components/LearningSessionView.test.tsx`, delete the entire `describe('LearningSessionView in-session relearn reinsertion', ...)` block, containing the three tests `'reinserts a missed question five questions later within the same session'`, `'reflects the grown question count in the final session stats'`, and `'does not reinsert a card a second time and rates each occurrence independently'`.

A `describe('maskSentenceAnswer', ...)` block (testing an unrelated sentence-masking helper) was merged directly after this block on 2026-08-05 — leave that block and its `maskSentenceAnswer` import on the `LearningSessionView` import line untouched; only remove the `'LearningSessionView in-session relearn reinsertion'` describe block itself.

- [ ] **Step 2: Write the new failing tests**

Add this new `describe` block where the old one was removed. Add these two imports to the top of the file first:

```ts
import {SHORT_TERM_WINDOW_MS} from '../features/scheduling/reviewCountdown';
import type {AutomaticRating} from '../features/scheduling/automaticRating';
```

The mock below schedules the *target* card (`meaningCard.id` — this is what every clone of `question` also carries as `targetMeaningCard.id`) at a configurable distance, and always schedules filler cards 2 days out so answering a filler never triggers its own reinsertion and complicates the count:

```ts
function buildScheduleForTarget(minutesFromReview: number) {
  return async (
    cardId: string,
    rating: AutomaticRating,
    reviewedAt: Date,
  ) => {
    const scheduled = scheduleCard(newCardRow, rating, reviewedAt);
    const isTarget = cardId === meaningCard.id;
    scheduled.card.due = new Date(
      reviewedAt.getTime() + (isTarget ? minutesFromReview : 2 * 24 * 60) * 60_000,
    );
    return scheduled;
  };
}

describe('LearningSessionView FSRS-driven in-session reinsertion', () => {
  it('reinserts a question 3 questions later when its resolved schedule is within the short-term window', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) => buildFillerQuestion(i + 1));

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(10)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`Đáp án đúng ${i + 1}`) }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    expect(screen.getByText('Câu 5 / 8')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'),
    ).toBeInTheDocument();
  });

  it('keeps reinserting the same card with no cap while its schedule stays within the window', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) => buildFillerQuestion(i + 1));

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(10)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(`Đáp án đúng ${i + 1}`) }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    expect(screen.getByText('Câu 5 / 8')).toBeInTheDocument();
    const secondPass = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(secondPass, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(screen.getByText('Câu 6 / 9')).toBeInTheDocument();
  });

  it('does not reinsert when the resolved schedule is beyond the short-term window', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) => buildFillerQuestion(i + 1));

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(2 * 24 * 60)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(screen.getByText('Câu 2 / 7')).toBeInTheDocument();
  });

  it('appends the reinsertion at the tail when fewer than 3 questions remain', async () => {
    const singleFiller = [buildFillerQuestion(1)];

    render(
      <LearningSessionView
        questions={[question, ...singleFiller]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={buildScheduleForTarget(10)}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...');
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Only 1 question (the filler) was ahead of the target, fewer than the
    // 3 needed for a full gap, so the clone lands right after it — at the
    // tail of the queue — instead of exactly 3 questions later.
    expect(screen.getByText('Câu 2 / 3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/LearningSessionView.test.tsx`
Expected: FAIL for all four new tests — the current implementation only reinserts on `attemptsCount > 1`, and these tests answer correctly on the first try.

- [ ] **Step 4: Implement**

In `src/components/LearningSessionView.tsx`, add to the imports:

```ts
import {formatRelativeDueTime} from '../features/scheduling/relativeDueTime';
```
add right after it:
```ts
import {SHORT_TERM_WINDOW_MS} from '../features/scheduling/reviewCountdown';
```

Replace the ref declaration:

```ts
  const reinsertedMeaningCardIdsRef = useRef<Set<string>>(new Set());
```
with:
```ts
  const reinsertSeqRef = useRef(0);
```

Remove the old miss-based reinsertion block. Change:

```ts
    if (correct) {
      // First attempt recording
      const isFirstTry = newAttempts === 1;
      if (isFirstTry) {
        firstAttemptSuccessesRef.current += 1;
      } else {
        const cardId = currentQuestion.targetMeaningCard.id;
        if (!reinsertedMeaningCardIdsRef.current.has(cardId)) {
          reinsertedMeaningCardIdsRef.current.add(cardId);
          const relearnQuestion: Question = {
            ...currentQuestion,
            id: `${currentQuestion.id}_relearn`,
          };
          setSessionQuestions((prev) => {
            const insertAt = Math.min(currentIndex + 5, prev.length);
            const next = [...prev];
            next.splice(insertAt, 0, relearnQuestion);
            return next;
          });
        }
      }
      totalAttemptedQuestionsRef.current += 1;
```

to:

```ts
    if (correct) {
      // First attempt recording
      const isFirstTry = newAttempts === 1;
      if (isFirstTry) {
        firstAttemptSuccessesRef.current += 1;
      }
      totalAttemptedQuestionsRef.current += 1;
```

Add the new FSRS-driven reinsertion check inside the existing `.then((schedule) => { ... })` callback. Change:

```ts
            )).then((schedule) => {
              if (reviewRequestIdRef.current !== requestId) return;
              setReviewSchedule(schedule);
              setIsReviewSaving(false);
              setReviewSaveError(!schedule);
            }).catch(() => {
```

to:

```ts
            )).then((schedule) => {
              if (reviewRequestIdRef.current !== requestId) return;
              setReviewSchedule(schedule);
              setIsReviewSaving(false);
              setReviewSaveError(!schedule);
              if (schedule && schedule.card.due.getTime() - reviewedAt.getTime() <= SHORT_TERM_WINDOW_MS) {
                reinsertSeqRef.current += 1;
                const relearnQuestion: Question = {
                  ...currentQuestion,
                  id: `${currentQuestion.id}_relearn_${reinsertSeqRef.current}`,
                };
                setSessionQuestions((prev) => {
                  const insertAt = Math.min(currentIndex + 4, prev.length);
                  const next = [...prev];
                  next.splice(insertAt, 0, relearnQuestion);
                  return next;
                });
              }
            }).catch(() => {
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/LearningSessionView.test.tsx`
Expected: PASS — every test in the file.

- [ ] **Step 6: Commit**

```bash
git add src/components/LearningSessionView.tsx src/components/LearningSessionView.test.tsx
git commit -m "feat: reinsert questions by FSRS short-term schedule instead of miss count"
```

---

### Task 7: Full-suite verification and push to main

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS across the whole suite. If any test outside the files touched in Tasks 1-6 fails (for example a fixture in another test file that happens to rely on `INITIAL_WORDS` or on `buildSessionQuestions` producing exactly one question per card with fewer than 5-10 cards), fix that fixture the same way Task 3 did — pad it with enough qualifying cards via a local filler, or an equivalent existing helper in that file — then re-run.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (in particular, confirm every call site of `buildSessionQuestions` destructures/handles the new `insufficientCards` field, and that `LearningSessionView.tsx` no longer references the removed `reinsertedMeaningCardIdsRef`).

- [ ] **Step 3: Push to main**

The user has explicitly asked to implement this without agent dispatch and push straight to `main` (no PR). After the full suite and type-check are green:

```bash
git push origin main
```
