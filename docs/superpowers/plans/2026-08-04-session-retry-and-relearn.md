# Session Clean-Retype and In-Session Relearn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `LearningSessionView`, force a blank retype after any wrong typed answer, and reinsert a missed question later in the same session instead of only in a future session.

**Architecture:** Both changes live entirely inside `src/components/LearningSessionView.tsx`. Task 1 changes what the two existing retry code paths clear. Task 2 turns the `questions` prop into local mutable state so a missed question's clone can be spliced back into the queue at `currentIndex + 5`, capped at one reinsertion per meaning card per session via a `Set` ref.

**Tech Stack:** React 18 (function components, hooks), TypeScript, Vitest + @testing-library/react for tests.

## Global Constraints

- No changes to `src/utils/sessionBuilder.ts`, `src/features/scheduling/automaticRating.ts`, or any FSRS scheduling code — per the spec, this is a UX/queue change only.
- No change to `en_to_vn_mc`, `vn_to_en_mc`, or `word_part_selection` retry behavior — only the typed-answer question types (`full_word_typing`, `word_part_typing`, `sentence_completion`, `image_question`, `audio_question`) get the blank-retry gate.
- Each in-session reinsertion is a full, independent review (its own `onAttempt`/`onReviewCompleted` calls) — do not special-case scoring for a replay.
- Reinsertion is capped at exactly one replay per `meaningCard.id` per session; do not make this configurable.
- Reinsertion offset is fixed at 5 questions later (or end of queue if fewer remain); do not make this configurable.

Design reference: `docs/superpowers/specs/2026-08-04-session-retry-and-relearn-design.md`

---

## Task 1: Blank the typed answer on retry

**Files:**
- Modify: `src/components/LearningSessionView.tsx:1-42` (imports, new helper), `src/components/LearningSessionView.tsx:384-396` (Enter-key retry), `src/components/LearningSessionView.tsx:746-758` (Retry button)
- Test: `src/components/LearningSessionView.test.tsx`

**Interfaces:**
- Consumes: existing component state setters `setTypingValue`, `setPartTypingValues`, `setIsChecked`, `setDiffResult`; existing `currentQuestion.type: QuestionType`.
- Produces: a module-level helper `isTypingQuestionType(type: QuestionType): boolean` that Task 2 does not need but later maintainers can reuse.

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe('LearningSessionView session completion', ...)` block in `src/components/LearningSessionView.test.tsx`, right after the `'does not show the comparison rows after a correct typed answer'` test (before its closing `});` at line 479):

```tsx
  it('clears the typed answer back to blank when retrying via the Retry button', () => {
    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    ) as HTMLInputElement;
    fireEvent.change(answerInput, { target: { value: 'remmber' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    expect(answerInput.value).toBe('remmber');

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));

    expect(answerInput.value).toBe('');
  });

  it('clears the typed answer back to blank when retrying with Enter', () => {
    render(
      <LearningSessionView
        questions={[question]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    ) as HTMLInputElement;
    fireEvent.change(answerInput, { target: { value: 'remmber' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(answerInput.value).toBe('');
  });

  it('clears word-part typing inputs back to blank when retrying a wrong attempt', () => {
    const wordPartQuestion: Question = {
      ...question,
      id: 'question-remember-parts-retry',
      stage: 3,
      type: 'word_part_typing',
      wordParts: [
        { id: 'part-remember', text: 'remember', type: 'root', order: 1 },
      ],
    };

    render(
      <LearningSessionView
        questions={[wordPartQuestion]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const rootInput = screen.getByPlaceholderText('root') as HTMLInputElement;
    fireEvent.change(rootInput, { target: { value: 'remmber' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    expect(rootInput.value).toBe('remmber');

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));

    expect(rootInput.value).toBe('');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/LearningSessionView.test.tsx -t "clears"`
Expected: all three new tests FAIL (the input still shows `'remmber'` after retry).

- [ ] **Step 3: Implement the blank-retry gate**

In `src/components/LearningSessionView.tsx`, add `QuestionType` to the existing type-only import from `'../types'` (currently at lines 15-23):

```tsx
import {
  MeaningCard,
  Question,
  QuestionType,
  UserSettings,
  SessionStats,
  StudyAttemptInput,
  StudyInputMode,
  WordPart,
} from '../types';
```

Add this helper right after the `maskSentenceAnswer` function (after its closing `}` around line 42, before `import { CharacterDiffComparison } from './CharacterDiffComparison';`):

```tsx
const TYPED_ANSWER_QUESTION_TYPES: readonly QuestionType[] = [
  'full_word_typing',
  'word_part_typing',
  'sentence_completion',
  'image_question',
  'audio_question',
];

function isTypingQuestionType(type: QuestionType): boolean {
  return TYPED_ANSWER_QUESTION_TYPES.includes(type);
}
```

Update the Enter-key retry branch (currently lines 390-395):

```tsx
        } else if (!isCorrect) {
          // Retry typing attempt
          setIsChecked(false);
          setDiffResult(null);
          if (currentQuestion && isTypingQuestionType(currentQuestion.type)) {
            setTypingValue('');
            setPartTypingValues({});
          }
          inputRef.current?.focus();
        }
```

Update the Retry button's `onClick` (currently lines 748-752):

```tsx
              onClick={() => {
                setIsChecked(false);
                setDiffResult(null);
                if (isTypingQuestionType(currentQuestion.type)) {
                  setTypingValue('');
                  setPartTypingValues({});
                }
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/LearningSessionView.test.tsx`
Expected: PASS — all tests in the file, including the three new ones and the pre-existing ones (they still set the full value via `fireEvent.change` after retry, so clearing first does not break them).

- [ ] **Step 5: Commit**

```bash
git add src/components/LearningSessionView.tsx src/components/LearningSessionView.test.tsx
git commit -m "fix: force a blank retype after a wrong typed answer in study sessions"
```

---

## Task 2: Reinsert a missed question later in the same session

**Files:**
- Modify: `src/components/LearningSessionView.tsx` — state declaration, the refs block, the correct-answer branch in `handleCheckAnswer`, `handleContinueNext`, the progress calculation, and the header label. Line numbers below are as of the pre-Task-1 file; Task 1 adds ~10 lines above all of these, so search for the exact code shown rather than trusting absolute line numbers.
- Test: `src/components/LearningSessionView.test.tsx`

**Interfaces:**
- Consumes: `Question` type (already imported), the `isFirstTry`/`newAttempts` values already computed in `handleCheckAnswer`.
- Produces: nothing new consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the failing tests**

Add a filler-question builder and two new tests. Insert the builder function right after the `newCardRow` constant (after line 91, before `afterEach`):

```tsx
function buildFillerQuestion(index: number): Question {
  const fillerMeaning: MeaningCard = {
    ...meaningCard,
    id: `meaning-filler-${index}`,
  };
  const fillerWord: Word = {
    ...pendingWord,
    id: `word-filler-${index}`,
    word: `filler${index}`,
    meanings: [fillerMeaning],
  };
  return {
    id: `question-filler-${index}`,
    word: fillerWord,
    targetMeaningCard: fillerMeaning,
    stage: 1,
    type: 'en_to_vn_mc',
    prompt: `Chọn nghĩa đúng cho filler ${index}`,
    mcOptions: [
      {
        id: 'opt_correct',
        label: `Đáp án đúng ${index}`,
        isCorrect: true,
        keyShortcut: '1',
      },
    ],
    expectedAnswer: `filler${index}`,
  };
}
```

Add these two tests in a new `describe` block at the end of `src/components/LearningSessionView.test.tsx` (after the closing `});` of `describe('LearningSessionView attempt persistence contract', ...)`):

```tsx
describe('LearningSessionView in-session relearn reinsertion', () => {
  it('reinserts a missed question five questions later within the same session', () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) =>
      buildFillerQuestion(i + 1),
    );

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    );
    fireEvent.change(answerInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(screen.getByText('Câu 2 / 8')).toBeInTheDocument();

    for (let i = 0; i < 4; i++) {
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(`Đáp án đúng ${i + 1}`),
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    expect(screen.getByText('Câu 6 / 8')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Gõ từ tiếng Anh tại đây...'),
    ).toBeInTheDocument();
  });

  it('reflects the grown question count in the final session stats', () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) =>
      buildFillerQuestion(i + 1),
    );
    let finishedStats: SessionStats | undefined;

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onFinishSession={(stats) => {
          finishedStats = stats;
        }}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    );
    fireEvent.change(answerInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Fillers 1-6: the 5th and 6th land after the reinserted clone (index 5).
    for (let i = 0; i < 4; i++) {
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(`Đáp án đúng ${i + 1}`),
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    // Index 5: the reinserted clone, answered correctly this time.
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    // Index 6-7: fillers 5 and 6.
    for (const i of [4, 5]) {
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(`Đáp án đúng ${i + 1}`),
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    expect(finishedStats?.reviewsCompleted).toBe(8);
  });

  it('does not reinsert a card a second time and rates each occurrence independently', async () => {
    const fillerQuestions = Array.from({ length: 6 }, (_, i) =>
      buildFillerQuestion(i + 1),
    );
    const ratings: string[] = [];

    render(
      <LearningSessionView
        questions={[question, ...fillerQuestions]}
        settings={settings}
        isExtraReview={false}
        onMeaningCardUpdated={() => undefined}
        onAttempt={() => undefined}
        onReviewCompleted={async (_cardId, rating, reviewedAt) => {
          ratings.push(rating);
          return scheduleCard(newCardRow, rating, reviewedAt);
        }}
        onFinishSession={() => undefined}
        onExitSession={() => undefined}
      />
    );

    const answerInput = screen.getByPlaceholderText(
      'Gõ từ tiếng Anh tại đây...',
    );

    fireEvent.change(answerInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    for (let i = 0; i < 4; i++) {
      fireEvent.click(
        screen.getByRole('button', {
          name: new RegExp(`Đáp án đúng ${i + 1}`),
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));
    }

    fireEvent.change(answerInput, { target: { value: 'wrong-again' } });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));
    fireEvent.change(answerInput, { target: { value: 'remember' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Check/i }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/i }));

    expect(screen.getByText(/Câu \d+ \/ 8/)).toBeInTheDocument();
    expect(ratings).toEqual(['Again', 'Again']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/LearningSessionView.test.tsx -t "relearn reinsertion"`
Expected: both tests FAIL — with the fixed `questions` prop, the count stays at 7 instead of growing to 8, and `Câu 6 / 8` / `Câu 2 / 8` are never rendered.

- [ ] **Step 3: Convert `questions` into local mutable state**

Replace line 75-76:

```tsx
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion = questions[currentIndex];
```

with:

```tsx
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>(questions);
  const currentQuestion = sessionQuestions[currentIndex];
```

Add a ref for the reinsertion cap next to the other refs (currently lines 100-106, right after `sessionStartTimeRef`):

```tsx
  const sessionStartTimeRef = useRef<number>(Date.now());
  const questionStartTimeRef = useRef<number>(Date.now());
  const retriesTotalRef = useRef<number>(0);
  const firstAttemptSuccessesRef = useRef<number>(0);
  const totalAttemptedQuestionsRef = useRef<number>(0);
  const reviewRequestIdRef = useRef(0);
  const reviewRetryRef = useRef<(() => void) | null>(null);
  const reinsertedMeaningCardIdsRef = useRef<Set<string>>(new Set());
```

- [ ] **Step 4: Splice a reinserted clone in on a missed-then-correct answer**

In `handleCheckAnswer`'s `if (correct)` branch, replace (currently lines 239-245):

```tsx
    if (correct) {
      // First attempt recording
      const isFirstTry = newAttempts === 1;
      if (isFirstTry) {
        firstAttemptSuccessesRef.current += 1;
      }
      totalAttemptedQuestionsRef.current += 1;
```

with:

```tsx
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

- [ ] **Step 5: Point the remaining `questions` reads at `sessionQuestions`**

In `handleContinueNext`, replace (currently lines 339-352):

```tsx
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Finish Session
      const accuracy =
        totalAttemptedQuestionsRef.current > 0
          ? Math.round(
              (firstAttemptSuccessesRef.current / totalAttemptedQuestionsRef.current) * 100
            )
          : 100;

      onFinishSession({
        reviewsCompleted: questions.length,
        newWordsLearned: questions.filter((q) => q.targetMeaningCard.fsrsState === 0).length,
```

with:

```tsx
    if (currentIndex + 1 < sessionQuestions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Finish Session
      const accuracy =
        totalAttemptedQuestionsRef.current > 0
          ? Math.round(
              (firstAttemptSuccessesRef.current / totalAttemptedQuestionsRef.current) * 100
            )
          : 100;

      onFinishSession({
        reviewsCompleted: sessionQuestions.length,
        newWordsLearned: sessionQuestions.filter((q) => q.targetMeaningCard.fsrsState === 0).length,
```

Replace the progress calculation (currently line 464):

```tsx
  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100);
```

with:

```tsx
  const progressPercent = Math.round(((currentIndex + 1) / sessionQuestions.length) * 100);
```

Replace the header label (currently line 480):

```tsx
            Câu {currentIndex + 1} / {questions.length}
```

with:

```tsx
            Câu {currentIndex + 1} / {sessionQuestions.length}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/LearningSessionView.test.tsx`
Expected: PASS — every test in the file, including the two new ones.

- [ ] **Step 7: Commit**

```bash
git add src/components/LearningSessionView.tsx src/components/LearningSessionView.test.tsx
git commit -m "feat: reinsert missed questions into the current study session"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions outside `LearningSessionView.test.tsx`.

- [ ] **Step 2: Type-check the project**

Run: `npm run lint`
Expected: PASS (no TypeScript errors).

- [ ] **Step 3: Build the project**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Start the dev server, begin a study session with at least 6 due/new words, deliberately mistype a `full_word_typing` question, confirm the input goes blank on retry, answer correctly, and confirm the same word reappears about 5 questions later before the session ends.
