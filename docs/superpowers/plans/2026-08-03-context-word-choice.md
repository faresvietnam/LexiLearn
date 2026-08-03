# Context Word Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic Stage 2 multiple-choice question that masks a base-form word in an example sentence and asks the learner to choose it from four same-part-of-speech options.

**Architecture:** A new pure `contextWordChoice` module validates examples, masks exactly one whole-word occurrence, and builds deterministic options without React or FSRS dependencies. The session builder uses it before existing Stage 2 fallbacks; the learning UI reuses the multiple-choice flow, while scheduling and skill modules give the new type context-specific scoring.

**Tech Stack:** TypeScript 5.8, React 19, Vitest 3, Testing Library, Vite, ts-fsrs

## Global Constraints

- The public question type is exactly `context_word_choice`.
- The type appears only at Stage 2.
- Eligible examples must use `wordForm === 'base'`, have `expectedAnswer` equal to the target base word after normalization, and contain exactly one case-insensitive whole-word occurrence.
- Options are one correct base word plus exactly three unique active, in-scope base words with the same normalized `partOfSpeech`.
- Missing example or distractor data uses `word_part_selection`, then `full_word_typing`; it never mixes parts of speech.
- Option selection and placement are deterministic; do not use `Math.random()` in the new path.
- Attempts persist `questionType: 'context_word_choice'` and `inputMode: 'multiple_choice'`.
- Automatic rating is capped at `Good`; timing baseline is 12 seconds and a response over 18 seconds is `Hard`.
- Any incorrect first attempt, retry, reveal, or hint level 5 is `Again`.
- The type updates `context_score`.
- No database migration, Gemini call, semantic classifier, new stage, or FSRS retention change.

---

### Task 1: Pure Context Question Builder

**Files:**
- Create: `src/features/questions/contextWordChoice.ts`
- Create: `src/features/questions/contextWordChoice.test.ts`
- Modify: `src/types/index.ts:151-160`

**Interfaces:**
- Consumes: `Word`, `MeaningCard`, and their `ExampleSentence` data.
- Produces:

```ts
export type ContextWordChoiceCandidate = {
  exampleSentence: ExampleSentence;
  maskedSentence: string;
  expectedAnswer: string;
  mcOptions: NonNullable<Question['mcOptions']>;
};

export function buildContextWordChoice(
  targetWord: Word,
  targetCard: MeaningCard,
  candidateWords: Word[],
  rotationSeed: number,
): ContextWordChoiceCandidate | null;
```

- [ ] **Step 1: Add the failing type and happy-path tests**

Add `'context_word_choice'` to `QuestionType`, then create
`contextWordChoice.test.ts` with a fixture whose target is adjective `fresh`,
whose base-form example is `The vegetables are still Fresh.`, and whose
in-scope candidates are `safe`, `young`, and `modern`.

Assert the literal result:

```ts
expect(result).toMatchObject({
  maskedSentence: 'The vegetables are still ___.',
  expectedAnswer: 'fresh',
  exampleSentence: expect.objectContaining({id: 'example-fresh'}),
});
expect(result?.mcOptions).toHaveLength(4);
expect(result?.mcOptions.filter(({isCorrect}) => isCorrect).map(({label}) => label))
  .toEqual(['fresh']);
expect(result?.mcOptions.map(({label}) => label).sort())
  .toEqual(['fresh', 'modern', 'safe', 'young']);
```

The production change this catches is any builder that fails to recognize a
case-insensitive punctuation-adjacent base word or returns an incomplete option
set.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- src/features/questions/contextWordChoice.test.ts
```

Expected: FAIL because `contextWordChoice.ts` and
`buildContextWordChoice` do not exist.

- [ ] **Step 3: Implement normalization, whole-word matching, and happy path**

Implement private helpers with these exact contracts:

```ts
const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function maskSingleWholeWord(sentence: string, answer: string): string | null {
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(answer)}(?![\\p{L}\\p{N}_])`, 'giu');
  const matches = [...sentence.matchAll(matcher)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const start = match.index!;
  return `${sentence.slice(0, start)}___${sentence.slice(start + match[0].length)}`;
}
```

Filter examples before rotation:

```ts
const validExamples = targetCard.exampleSentences.flatMap((example) => {
  if (example.wordForm !== 'base') return [];
  if (normalize(example.expectedAnswer) !== normalize(targetWord.word)) return [];
  const maskedSentence = maskSingleWholeWord(
    example.sentence,
    example.expectedAnswer,
  );
  return maskedSentence ? [{example, maskedSentence}] : [];
});
```

Filter distractors by active status, normalized part of speech, different Word
id, and unique normalized word label. Sort candidates by normalized label and
id before rotating. Select three from a rotation based on `rotationSeed`, add
the correct option, and rotate the four-option array again. Assign option ids
`context-correct` / `context-distractor-${word.id}` and shortcuts `1`–`4`.

- [ ] **Step 4: Add failing boundary tests**

Add table-driven tests that expect `null` for:

```ts
[
  ['non-base form', {wordForm: 'past'}],
  ['expected answer differs from target', {expectedAnswer: 'fresher'}],
  ['answer is absent', {sentence: 'The vegetables are crisp.'}],
  ['answer is only a substring', {sentence: 'Freshness matters.'}],
  ['answer occurs twice', {sentence: 'Fresh food stays fresh.'}],
]
```

Add separate tests proving:

- regex metacharacters in a base word are treated literally;
- duplicate labels collapse to one distractor;
- different part-of-speech, inactive, and target Word candidates are excluded;
- two valid distractors return `null`;
- the same seed gives the same option order and the next seed rotates it.

For scope isolation, pass only the scoped candidates to the helper and include
an inactive Word to prove the helper still enforces active status.

- [ ] **Step 5: Complete minimal builder behavior and verify GREEN**

Run:

```bash
npm test -- src/features/questions/contextWordChoice.test.ts
```

Expected: all pure builder tests pass with no warnings.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/types/index.ts src/features/questions/contextWordChoice.ts src/features/questions/contextWordChoice.test.ts
git commit -m "feat: build context word choice questions"
```

---

### Task 2: Stage 2 Session Selection and Fallbacks

**Files:**
- Modify: `src/utils/sessionBuilder.ts:14-145,175-265`
- Modify: `src/utils/sessionBuilder.test.ts`

**Interfaces:**
- Consumes: `buildContextWordChoice(...)` from Task 1.
- Produces: unchanged `buildSessionQuestions(...)` signature; Stage 2
  `Question` values may now have `type === 'context_word_choice'`.

- [ ] **Step 1: Write failing Stage 2 selection test**

Build four active, due, weak adjective cards: target `fresh` with a valid
base-form example and distractors `safe`, `young`, `modern`. Scope them all,
but set `reviewLimitPerDay: 1` so only the target becomes a question while all
four remain available as distractor sources.

Assert:

```ts
expect(session.questions).toHaveLength(1);
expect(session.questions[0]).toMatchObject({
  type: 'context_word_choice',
  stage: 2,
  expectedAnswer: 'fresh',
  exampleSentence: expect.objectContaining({id: 'example-fresh'}),
});
expect(session.questions[0].mcOptions?.map(({label}) => label).sort())
  .toEqual(['fresh', 'modern', 'safe', 'young']);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- src/utils/sessionBuilder.test.ts
```

Expected: the new Stage 2 test fails because the target currently becomes
`word_part_selection` or `full_word_typing`.

- [ ] **Step 3: Pass active scope candidates into question conversion**

Change every `convertQueueToQuestions` call to pass `activeWords`, not the
unfiltered `words` collection:

```ts
convertQueueToQuestions(selected, activeWords)
convertQueueToQuestions(spacedQueue, activeWords)
```

In `convertQueueToQuestions`, calculate the example and context candidate
before choosing the type:

```ts
const rotationSeed = index + meaningCard.history.length;
const contextCandidate = stage === 2
  ? buildContextWordChoice(word, meaningCard, allWords, rotationSeed)
  : null;
```

Choose Stage 2 in the approved order:

```ts
if (stage === 2 && contextCandidate) {
  qType = 'context_word_choice';
} else if (stage === 2 && word.wordStructure.length >= 2) {
  qType = 'word_part_selection';
}
```

For the new type, set:

```ts
prompt: 'Chọn từ phù hợp nhất để hoàn thành câu:'
mcOptions: contextCandidate.mcOptions
exampleSentence: contextCandidate.exampleSentence
expectedAnswer: contextCandidate.expectedAnswer
```

Add `maskedSentence?: string` to `Question` and populate it from the candidate.
Existing question types leave it undefined.

- [ ] **Step 4: Add failing fallback and scope tests**

Add tests proving these literal outcomes:

```ts
// Invalid context plus >=2 parts
expect(question.type).toBe('word_part_selection');

// Invalid context plus fewer than 2 parts
expect(question.type).toBe('full_word_typing');

// One distractor is inactive or outside selected deck
expect(question.type).not.toBe('context_word_choice');

// Stage 1/3/4/5 fixtures
expect(types).toEqual([
  'en_to_vn_mc',
  'word_part_typing',
  'word_part_typing',
  'full_word_typing',
]);
```

- [ ] **Step 5: Implement remaining fallback behavior and verify GREEN**

Run:

```bash
npm test -- src/features/questions/contextWordChoice.test.ts src/utils/sessionBuilder.test.ts
```

Expected: both focused suites pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/types/index.ts src/utils/sessionBuilder.ts src/utils/sessionBuilder.test.ts
git commit -m "feat: schedule context choices at stage two"
```

---

### Task 3: Multiple-Choice UI and Keyboard Contract

**Files:**
- Modify: `src/components/LearningSessionView.tsx:115-215,535-605`
- Modify: `src/components/LearningSessionView.test.tsx`

**Interfaces:**
- Consumes: a `Question` whose type is `context_word_choice`, with
  `maskedSentence` and four `mcOptions`.
- Produces: existing `onAttempt(StudyAttemptInput)` and
  `onReviewCompleted(...)` callbacks with the new question type.

- [ ] **Step 1: Write the failing render and attempt test**

Create a `contextQuestion` fixture by extending the existing test question:

```ts
const contextQuestion: Question = {
  ...question,
  type: 'context_word_choice',
  stage: 2,
  prompt: 'Chọn từ phù hợp nhất để hoàn thành câu:',
  maskedSentence: 'I will always ___ your help.',
  mcOptions: [
    {id: 'wrong-1', label: 'reject', isCorrect: false, keyShortcut: '1'},
    {id: 'correct', label: 'remember', isCorrect: true, keyShortcut: '2'},
    {id: 'wrong-2', label: 'borrow', isCorrect: false, keyShortcut: '3'},
    {id: 'wrong-3', label: 'follow', isCorrect: false, keyShortcut: '4'},
  ],
};
```

Render it, press `2`, press Enter, and assert:

```ts
expect(screen.getByText('I will always ___ your help.')).toBeInTheDocument();
expect(onAttempt).toHaveBeenCalledWith(expect.objectContaining({
  questionType: 'context_word_choice',
  inputMode: 'multiple_choice',
  submittedAnswer: 'remember',
  isCorrect: true,
}));
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- src/components/LearningSessionView.test.tsx
```

Expected: masked context is not rendered and/or the attempt is not classified
as multiple choice.

- [ ] **Step 3: Extend the existing multiple-choice branch**

Add one local predicate:

```ts
const isMultipleChoice = (type: QuestionType) =>
  type === 'en_to_vn_mc'
  || type === 'vn_to_en_mc'
  || type === 'context_word_choice';
```

Use it in `getInputMode`, `handleCheckAnswer`, and the option renderer. Render:

```tsx
{currentQuestion.type === 'context_word_choice' && currentQuestion.maskedSentence && (
  <div className="p-4 rounded-2xl bg-white border border-slate-200 text-lg text-indigo-900 font-medium shadow-xs">
    “{currentQuestion.maskedSentence}”
  </div>
)}
```

Keep number-key selection generic through `mcOptions`; do not add another
keyboard listener.

- [ ] **Step 4: Add failing retry-until-correct keyboard test**

Press shortcut `1`, Enter, then shortcut `2`, Enter. Assert two immutable
attempts:

```ts
expect(attempts.map(({attemptNumber, submittedAnswer, isCorrect}) => ({
  attemptNumber, submittedAnswer, isCorrect,
}))).toEqual([
  {attemptNumber: 1, submittedAnswer: 'reject', isCorrect: false},
  {attemptNumber: 2, submittedAnswer: 'remember', isCorrect: true},
]);
```

Assert the Answer Review contains the original target word and tested meaning.

- [ ] **Step 5: Complete UI behavior and verify GREEN**

Run:

```bash
npm test -- src/components/LearningSessionView.test.tsx
```

Expected: all LearningSessionView tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/LearningSessionView.tsx src/components/LearningSessionView.test.tsx
git commit -m "feat: answer context choices by keyboard"
```

---

### Task 4: Rating, Context Skill, and Persistence Contracts

**Files:**
- Modify: `src/features/scheduling/automaticRating.ts`
- Modify: `src/features/scheduling/automaticRating.test.ts`
- Modify: `src/features/scheduling/skillScores.ts`
- Modify: `src/features/scheduling/skillScores.test.ts`
- Modify: `src/features/scheduling/responseCalibration.ts`
- Modify: `src/features/scheduling/responseCalibration.test.ts`
- Modify: `src/features/persistence/sessionRepository.test.ts`

**Interfaces:**
- Consumes: existing `AutomaticRatingInput`, `SkillScoreInput`, and
  `StudyAttemptInput` with `questionType: 'context_word_choice'`.
- Produces: `Good | Hard | Again`, updates `context_score`, and serializes the
  existing text question type without repository branching.

- [ ] **Step 1: Write failing automatic-rating tests**

Add this literal matrix:

```ts
it.each([
  [{responseTimeMs: 12_000}, 'Good'],
  [{responseTimeMs: 18_000}, 'Good'],
  [{responseTimeMs: 18_001}, 'Hard'],
  [{responseTimeMs: 1_000, hintLevelUsed: 1}, 'Hard'],
  [{responseTimeMs: 1_000, attemptsCount: 2}, 'Again'],
  [{responseTimeMs: 1_000, answerRevealed: true}, 'Again'],
] as const)('rates context word choice conservatively: %o', (overrides, expected) => {
  expect(deriveAutomaticRating({
    ...baseInput,
    questionType: 'context_word_choice',
    responseTimeMs: 12_000,
    ...overrides,
  })).toBe(expected);
});
```

This matrix proves the type never reaches the typed-recall `Easy` branch.

- [ ] **Step 2: Verify rating RED**

Run:

```bash
npm test -- src/features/scheduling/automaticRating.test.ts
```

Expected: TypeScript/exhaustiveness fails or the new type receives incorrect
timing/hint behavior.

- [ ] **Step 3: Implement context rating**

Return `12_000` for `context_word_choice` in `expectedResponseTimeMs`.
Before the generic hint and recognition branches, add:

```ts
if (input.questionType === 'context_word_choice') {
  if (input.hintLevelUsed > 0) return 'Hard';
  return input.responseTimeMs > 18_000 ? 'Hard' : 'Good';
}
```

Keep this block after the existing top-level `Again` guard so retry, reveal,
failed recall, and hint level 5 remain `Again`.

- [ ] **Step 4: Write failing context-skill test**

Assert:

```ts
const result = updateSkillScores(
  {context_score: 40, recognition_score: 30},
  {
    questionType: 'context_word_choice',
    isCorrect: true,
    firstAttempt: true,
    responseTimeMs: 12_000,
    hintLevel: 0,
    answerRevealed: false,
    errorTypes: [],
  },
);
expect(result.context_score).toBe(50);
expect(result.recognition_score).toBe(30);
```

- [ ] **Step 5: Map the type to context score and verify**

Change `skillForQuestion` so both `sentence_completion` and
`context_word_choice` return `context_score`.

Run:

```bash
npm test -- src/features/scheduling/automaticRating.test.ts src/features/scheduling/skillScores.test.ts
```

Expected: both suites pass.

- [ ] **Step 6: Cover calibration and persistence compatibility**

Add a response calibration assertion:

```ts
expect(calibratedResponseTime('context_word_choice', 5, {})).toBe(12_000);
```

Add an explicit branch to `calibratedResponseTime`:

```ts
if (type === 'context_word_choice') return baselines[type] ?? 12_000;
```

Automatic FSRS rating continues to own the approved 18-second slow threshold.

Extend the repository RPC fixture with an attempt whose
`questionType` is `context_word_choice`, then assert its serialized JSONB row
contains:

```ts
{
  question_type: 'context_word_choice',
  input_mode: 'multiple_choice',
}
```

No production repository change is expected because serialization already
copies these text values. If the test passes immediately, retain it as a
boundary characterization test rather than changing repository code.

- [ ] **Step 7: Run focused scoring and persistence suites**

Run:

```bash
npm test -- src/features/scheduling/automaticRating.test.ts src/features/scheduling/skillScores.test.ts src/features/scheduling/responseCalibration.test.ts src/features/persistence/sessionRepository.test.ts
```

Expected: all focused suites pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/features/scheduling/automaticRating.ts src/features/scheduling/automaticRating.test.ts src/features/scheduling/skillScores.ts src/features/scheduling/skillScores.test.ts src/features/scheduling/responseCalibration.ts src/features/scheduling/responseCalibration.test.ts src/features/persistence/sessionRepository.test.ts
git commit -m "feat: score context word choices"
```

---

### Task 5: Complete Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-03-context-word-choice.md`

**Interfaces:**
- Consumes: all Task 1–4 behavior.
- Produces: verified implementation ready for integration.

- [ ] **Step 1: Run all automated checks**

Run each command and require exit code 0:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all Vitest files pass, TypeScript emits no errors, Vite/esbuild
complete successfully, and `git diff --check` emits no output. The existing
Vite chunk-size warning is informational and does not fail the build.

- [ ] **Step 2: Perform the mutation checklist**

Temporarily verify mentally against the committed tests that each mutation is
caught:

- change Stage 2 priority to word-parts first;
- accept a past-form example;
- accept two same-POS distractors;
- remove whole-word boundaries;
- map the type to `recognition_score`;
- allow fast context selection to return `Easy`;
- classify the attempt as `typing`.

If a mutation is not protected, add the smallest behavior test before
finishing.

- [ ] **Step 3: Mark plan checkboxes and commit verification metadata**

Mark completed steps `[x]`, then:

```bash
git add docs/superpowers/plans/2026-08-03-context-word-choice.md
git commit -m "docs: verify context word choice"
```
