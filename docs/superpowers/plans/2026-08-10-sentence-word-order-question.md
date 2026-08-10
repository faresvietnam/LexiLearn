# Sentence Word-Order Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tap-to-arrange word-order question type for sentence review, shown instead of free typing for any sentence card whose `fsrsState !== 2` (not yet in the FSRS "Review" state), with Good/Hard/Easy/Again grading that now factors in response time for both question types.

**Architecture:** One new self-contained component (`WordOrderQuestion`) that `SentenceReviewView` renders instead of the existing typing form based on the current card's `fsrsState`. `deriveSentenceRating` changes from a positional `(wrongAttempts)` call to an object argument carrying `responseTimeMs`/`expectedResponseTimeMs`, used by both question types. No schema change, no change to `scheduleCard()` / `submitSentenceReview()`.

## Global Constraints

- No new `sentence_cards` columns, no Supabase migration for this change — question type is derived from the existing `fsrsState` field only.
- Word-order reveal (3rd wrong attempt) shows plain text, not `CharacterDiffComparison` — there's no per-character diff for a token-order mistake.
- Wrong attempts 1–2 keep the answer row exactly as the learner left it (no reset).
- `deriveSentenceRating`'s "any retry forces `Again`" word-system rule is deliberately NOT adopted — the existing 3-strike-then-reveal framework for sentences stays as-is; only the "correct on the very first try" branch gains speed-based Easy/Good/Hard nuance.

---

## Task 1: `deriveSentenceRating` — object argument + response-time baselines

**Files:**
- Modify: `src/features/scheduling/sentenceRating.ts`
- Modify: `src/features/scheduling/sentenceRating.test.ts`

**Interfaces:**
- Produces: `deriveSentenceRating(input: {wrongAttemptsBeforeSuccess: number; responseTimeMs: number; expectedResponseTimeMs: number}): AutomaticRating`, `expectedWordOrderResponseTimeMs(wordCount: number): number`, `expectedTypingResponseTimeMs(wordCount: number): number`. Consumed by Task 3 (`SentenceReviewView.tsx`) and Task 2 indirectly (word count comes from the sentence `WordOrderQuestion` is given, but the expected-time calculation itself stays in `SentenceReviewView`, which owns the `onSubmitReview` call — see Task 3).

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/features/scheduling/sentenceRating.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {
  deriveSentenceRating,
  expectedTypingResponseTimeMs,
  expectedWordOrderResponseTimeMs,
} from './sentenceRating';

describe('deriveSentenceRating', () => {
  it('rates Hard whenever a retry was needed, regardless of speed', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 1,
      responseTimeMs: 100,
      expectedResponseTimeMs: 10_000,
    })).toBe('Hard');
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 2,
      responseTimeMs: 100,
      expectedResponseTimeMs: 10_000,
    })).toBe('Hard');
  });

  it('rates Easy when correct on the first try and fast', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 0,
      responseTimeMs: 1_000,
      expectedResponseTimeMs: 10_000,
    })).toBe('Easy');
  });

  it('rates Good when correct on the first try at a normal pace', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 0,
      responseTimeMs: 10_000,
      expectedResponseTimeMs: 10_000,
    })).toBe('Good');
  });

  it('rates Hard when correct on the first try but slow', () => {
    expect(deriveSentenceRating({
      wrongAttemptsBeforeSuccess: 0,
      responseTimeMs: 20_000,
      expectedResponseTimeMs: 10_000,
    })).toBe('Hard');
  });
});

describe('expectedWordOrderResponseTimeMs', () => {
  it('scales with word count above a floor', () => {
    expect(expectedWordOrderResponseTimeMs(1)).toBe(4_000);
    expect(expectedWordOrderResponseTimeMs(10)).toBe(12_000);
  });
});

describe('expectedTypingResponseTimeMs', () => {
  it('scales with word count above a floor', () => {
    expect(expectedTypingResponseTimeMs(1)).toBe(12_000);
    expect(expectedTypingResponseTimeMs(10)).toBe(18_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/scheduling/sentenceRating.test.ts`
Expected: FAIL — old signature takes a plain number, `expectedWordOrderResponseTimeMs`/`expectedTypingResponseTimeMs` don't exist.

- [ ] **Step 3: Implement**

Replace the contents of `src/features/scheduling/sentenceRating.ts`:

```ts
import type {AutomaticRating} from './automaticRating';

export interface SentenceRatingInput {
  wrongAttemptsBeforeSuccess: number;
  responseTimeMs: number;
  expectedResponseTimeMs: number;
}

export function deriveSentenceRating(input: SentenceRatingInput): AutomaticRating {
  if (input.wrongAttemptsBeforeSuccess > 0) return 'Hard';

  const speedRatio = input.responseTimeMs / input.expectedResponseTimeMs;
  if (speedRatio > 1.5) return 'Hard';
  if (speedRatio <= 0.6) return 'Easy';
  return 'Good';
}

export function expectedWordOrderResponseTimeMs(wordCount: number): number {
  return Math.max(4_000, wordCount * 1_200);
}

export function expectedTypingResponseTimeMs(wordCount: number): number {
  return Math.max(12_000, wordCount * 1_800);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/scheduling/sentenceRating.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/scheduling/sentenceRating.ts src/features/scheduling/sentenceRating.test.ts
git commit -m "feat: add response-time-aware sentence rating baselines"
```

---

## Task 2: `WordOrderQuestion` component

**Files:**
- Create: `src/components/WordOrderQuestion.tsx`
- Test: `src/components/WordOrderQuestion.test.tsx`

**Interfaces:**
- Produces: `WordOrderQuestion({sentence: string, onResolve: (result: {isCorrect: boolean; wrongAttempts: number; responseTimeMs: number}) => void})` — used by `SentenceReviewView` (Task 3). `wrongAttempts` is the count of failed checks before this resolution: 0/1/2 on success, always 2 when `isCorrect` is false (resolution only happens via the "Tiếp tục" click after the 3rd wrong check).

- [ ] **Step 1: Write the failing tests**

Create `src/components/WordOrderQuestion.test.tsx`:

```tsx
import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {WordOrderQuestion} from './WordOrderQuestion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WordOrderQuestion', () => {
  it('renders every word as a chip and disables Kiểm tra until all are placed', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    expect(screen.getByRole('button', {name: 'Kiểm tra'})).toBeDisabled();
    ['The', 'cat', 'sleeps.'].forEach((word) => {
      expect(screen.getByRole('button', {name: word})).toBeInTheDocument();
    });
  });

  it('moves a tapped word into the answer row, and back to the pool on a second tap', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    expect(screen.getByRole('button', {name: 'Kiểm tra'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    expect(screen.getByRole('button', {name: 'Kiểm tra'})).toBeDisabled();
  });

  it('resolves correct when the words are placed in the right order', () => {
    const onResolve = vi.fn();
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={onResolve} />);

    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      isCorrect: true,
      wrongAttempts: 0,
    }));
  });

  it('shows a wrong hint for the first two wrong orders (keeping the arrangement), then reveals on the third', () => {
    const onResolve = vi.fn();
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={onResolve} />);
    const submitWrongOrder = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
      fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));
    };
    const undoAll = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    };

    submitWrongOrder();
    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
    undoAll();

    submitWrongOrder();
    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
    undoAll();

    submitWrongOrder();
    expect(screen.getByText('The cat sleeps.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Tiếp tục'}));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      isCorrect: false,
      wrongAttempts: 2,
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/WordOrderQuestion.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `src/components/WordOrderQuestion.tsx`:

```tsx
import React, {useRef, useState} from 'react';

interface WordOrderQuestionProps {
  sentence: string;
  onResolve: (result: {isCorrect: boolean; wrongAttempts: number; responseTimeMs: number}) => void;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const WordOrderQuestion: React.FC<WordOrderQuestionProps> = ({sentence, onResolve}) => {
  const tokensRef = useRef(sentence.trim().split(/\s+/));
  const tokens = tokensRef.current;
  const [pool, setPool] = useState<string[]>(() => shuffle(tokens));
  const [answer, setAnswer] = useState<string[]>([]);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showWrongHint, setShowWrongHint] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const startTimeRef = useRef(performance.now());

  const moveToAnswer = (poolIndex: number) => {
    setShowWrongHint(false);
    setAnswer((current) => [...current, pool[poolIndex]]);
    setPool((current) => current.filter((_, i) => i !== poolIndex));
  };

  const moveToPool = (answerIndex: number) => {
    setShowWrongHint(false);
    setPool((current) => [...current, answer[answerIndex]]);
    setAnswer((current) => current.filter((_, i) => i !== answerIndex));
  };

  const handleCheck = () => {
    const isCorrect = answer.length === tokens.length
      && answer.every((word, i) => word.toLowerCase() === tokens[i].toLowerCase());
    const responseTimeMs = performance.now() - startTimeRef.current;

    if (isCorrect) {
      onResolve({isCorrect: true, wrongAttempts, responseTimeMs});
      return;
    }

    const nextWrongAttempts = wrongAttempts + 1;
    setWrongAttempts(nextWrongAttempts);
    if (nextWrongAttempts >= 3) {
      setShowReveal(true);
    } else {
      setShowWrongHint(true);
    }
  };

  const handleContinueAfterReveal = () => {
    onResolve({
      isCorrect: false,
      wrongAttempts: 2,
      responseTimeMs: performance.now() - startTimeRef.current,
    });
  };

  if (showReveal) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 text-center">Đáp án đúng:</p>
        <p className="text-lg font-semibold text-slate-900 text-center">{sentence}</p>
        <button
          type="button"
          onClick={handleContinueAfterReveal}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
        >
          Tiếp tục
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="text-xs font-bold text-slate-700">Sắp xếp thành câu tiếng Anh</label>
      <div className="min-h-14 flex flex-wrap gap-2 p-3 border-2 border-indigo-200 rounded-xl bg-indigo-50/40">
        {answer.map((word, i) => (
          <button
            key={`answer-${i}`}
            type="button"
            onClick={() => moveToPool(i)}
            className="px-3 py-2 rounded-lg bg-white border border-indigo-300 text-slate-900 font-semibold shadow-sm"
          >
            {word}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">Chọn từng từ để xếp thành câu</p>
      <div className="flex flex-wrap justify-center gap-2">
        {pool.map((word, i) => (
          <button
            key={`pool-${i}`}
            type="button"
            onClick={() => moveToAnswer(i)}
            className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 font-semibold hover:bg-slate-200 transition"
          >
            {word}
          </button>
        ))}
      </div>

      {showWrongHint && (
        <p role="alert" className="text-sm text-rose-700">Sai rồi, thử lại.</p>
      )}

      <button
        type="button"
        onClick={handleCheck}
        disabled={pool.length > 0}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
      >
        Kiểm tra
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/WordOrderQuestion.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/WordOrderQuestion.tsx src/components/WordOrderQuestion.test.tsx
git commit -m "feat: add WordOrderQuestion tap-to-arrange sentence question"
```

---

## Task 3: Wire into `SentenceReviewView`

**Files:**
- Modify: `src/components/SentenceReviewView.tsx`
- Modify: `src/components/SentenceReviewView.test.tsx`

**Interfaces:**
- Consumes: `WordOrderQuestion` (Task 2); `deriveSentenceRating`, `expectedTypingResponseTimeMs`, `expectedWordOrderResponseTimeMs` (Task 1).
- Produces: no new exports — this is the integration point.

- [ ] **Step 1: Update existing tests to pin the typing path with `fsrsState: 2`**

In `src/components/SentenceReviewView.test.tsx`, `buildCard()`'s default `fsrsState: 0` now means "not yet mastered," which will render `WordOrderQuestion` instead of the typing form. The tests that exercise typing-specific UI need an explicit `fsrsState: 2` override so they keep testing what they already test. Update these three call sites:

1. `'shows the Vietnamese sentence as the prompt and rates Good on a correct first try'` — change `buildCard()` to `buildCard({fsrsState: 2})`, and mock `performance.now` so the response time lands at a "normal pace" (otherwise a synchronous test runs in ~0ms, which the new speed check would rate `Easy`, not `Good`). Add this at the top of the test body, right after the `vi.spyOn(Math, 'random')` line:

```ts
let now = 0;
vi.spyOn(performance, 'now').mockImplementation(() => now);
```

and right before the `fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}))` line, add:

```ts
now = 12_000; // matches expectedTypingResponseTimeMs(3) for "The cat sleeps." → normal pace
```

2. `'shows a plain wrong hint (no diff) for the first two wrong attempts, then Hard on the correct 3rd try'` — change `buildCard()` to `buildCard({fsrsState: 2})`. No timing mock needed (this path is always `Hard` regardless of speed).

3. `'reveals the diff and rates Again after the 3rd wrong attempt, advancing on continue'` — change both `buildCard()` and `buildCard({id: 'sentence-2', englishSentence: 'Dogs bark.'})` to also include `fsrsState: 2`. No timing mock needed (`Again` is hardcoded on this path).

Leave `'shows the empty state when no card is due'` and `'shows the image as the prompt when random picks image'` unchanged — neither asserts anything about which question form renders below the prompt.

- [ ] **Step 2: Add the new word-order tests**

Append to `src/components/SentenceReviewView.test.tsx`, inside the existing `describe('SentenceReviewView', ...)` block:

```ts
  it('renders the word-order question for a not-yet-mastered card and rates a correct, on-pace arrangement Good', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard({fsrsState: 0})]} onSubmitReview={onSubmitReview} />);

    expect(screen.getByText('Sắp xếp thành câu tiếng Anh')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    now = 4_000; // matches expectedWordOrderResponseTimeMs(3) → normal pace
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Good'));
  });

  it('rates Again after 3 wrong word-order attempts and advances on continue', async () => {
    const cards = [buildCard({fsrsState: 0}), buildCard({id: 'sentence-2', englishSentence: 'Dogs bark.', fsrsState: 0})];
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={cards} onSubmitReview={onSubmitReview} />);
    const submitWrongOrder = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
      fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));
    };
    const undoAll = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    };

    submitWrongOrder();
    undoAll();
    submitWrongOrder();
    undoAll();
    submitWrongOrder();

    expect(await screen.findByText('The cat sleeps.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Tiếp tục'}));

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Again'));
    await waitFor(() => expect(screen.getByText('Câu 2 / 2')).toBeInTheDocument());
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/SentenceReviewView.test.tsx`
Expected: FAIL — `SentenceReviewView` doesn't branch on `fsrsState` yet, so the word-order tests can't find "Sắp xếp thành câu tiếng Anh", and the Good-rating test's timing mock changes the typing path's (not-yet-implemented) time-aware rating.

- [ ] **Step 4: Implement the integration**

Replace the contents of `src/components/SentenceReviewView.tsx`:

```tsx
import React, {useRef, useState} from 'react';
import {Volume2} from 'lucide-react';
import {SentenceCard} from '../types';
import type {AutomaticRating} from '../features/scheduling/automaticRating';
import {
  deriveSentenceRating,
  expectedTypingResponseTimeMs,
  expectedWordOrderResponseTimeMs,
} from '../features/scheduling/sentenceRating';
import {normalizeText} from '../utils/charDiff';
import {playSentenceAudio} from '../utils/playSentenceAudio';
import {CharacterDiffComparison} from './CharacterDiffComparison';
import {WordOrderQuestion} from './WordOrderQuestion';

interface SentenceReviewViewProps {
  sentenceCards: SentenceCard[];
  onSubmitReview: (cardId: string, rating: AutomaticRating) => Promise<boolean>;
}

function pickPromptKind(): 'image' | 'vietnamese' {
  return Math.random() < 0.5 ? 'image' : 'vietnamese';
}

function wordCount(sentence: string): number {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
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
  const startTimeRef = useRef(performance.now());

  const card = queue[index];
  const questionKind = card && card.fsrsState === 2 ? 'typing' : 'word_order';

  const advance = () => {
    setIndex((current) => current + 1);
    setPromptKind(pickPromptKind());
    setTypedAnswer('');
    setWrongAttempts(0);
    setShowWrongHint(false);
    setShowDiff(false);
    startTimeRef.current = performance.now();
  };

  const submitAndAdvance = async (rating: AutomaticRating) => {
    if (!card) return;
    setIsSubmitting(true);
    try {
      await onSubmitReview(card.id, rating);
      advance();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!card || showDiff || isSubmitting) return;

    const isCorrect = normalizeText(typedAnswer) === normalizeText(card.englishSentence);
    if (isCorrect) {
      const responseTimeMs = performance.now() - startTimeRef.current;
      await submitAndAdvance(deriveSentenceRating({
        wrongAttemptsBeforeSuccess: wrongAttempts,
        responseTimeMs,
        expectedResponseTimeMs: expectedTypingResponseTimeMs(wordCount(card.englishSentence)),
      }));
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
  };

  const handleContinueAfterDiff = () => void submitAndAdvance('Again');

  const handleWordOrderResolve = (result: {isCorrect: boolean; wrongAttempts: number; responseTimeMs: number}) => {
    if (!card) return;
    const rating = result.isCorrect
      ? deriveSentenceRating({
          wrongAttemptsBeforeSuccess: result.wrongAttempts,
          responseTimeMs: result.responseTimeMs,
          expectedResponseTimeMs: expectedWordOrderResponseTimeMs(wordCount(card.englishSentence)),
        })
      : 'Again';
    void submitAndAdvance(rating);
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

        {questionKind === 'word_order' ? (
          <WordOrderQuestion
            key={card.id}
            sentence={card.englishSentence}
            onResolve={handleWordOrderResolve}
          />
        ) : showDiff ? (
          <div className="space-y-4">
            <CharacterDiffComparison userInput={typedAnswer} expectedInput={card.englishSentence} />
            {card.ipa && (
              <p className="text-sm text-indigo-600 font-mono text-center">{card.ipa}</p>
            )}
            <button
              type="button"
              onClick={() => playSentenceAudio(card.englishSentence, card.audioUrl)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition"
            >
              <Volume2 className="w-4 h-4" /> Nghe câu
            </button>
            <button
              type="button"
              onClick={handleContinueAfterDiff}
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

Note the refactor folds the old `handleContinueAfterDiff`'s inline submit-and-advance into a shared `submitAndAdvance` helper, now used by all three resolution paths (typing-correct, diff-continue, word-order-resolve) instead of duplicating the `setIsSubmitting`/`onSubmitReview`/`advance` sequence three times.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/SentenceReviewView.test.tsx`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/SentenceReviewView.tsx src/components/SentenceReviewView.test.tsx
git commit -m "feat: show word-order question for not-yet-mastered sentence cards"
```

---

## Task 4: Full verification and push to main

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: GitNexus change-scope check**

Run `detect_changes()` (per this repo's CLAUDE.md) and confirm only the expected symbols/files are affected before pushing.

- [ ] **Step 4: Push directly to `main`**

No Supabase migration is needed for this change (question type is derived from the existing `fsrsState` field, no new columns). Merge the local branch forward and push:

```bash
git fetch origin main
git merge --no-edit origin/main
npx vitest run
git push origin HEAD:main
git push origin claude/english-learning-feature-36b648
```

(Mirrors how the previous sentence-cards changes were pushed straight to `main` earlier in this branch's history — `main` isn't checked out in this worktree, so a local merge-then-push is used instead of switching branches.)
