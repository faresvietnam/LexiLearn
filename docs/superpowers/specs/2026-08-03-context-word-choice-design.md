# Context Word Choice Design

## Goal

Add a ninth question type that shows an example sentence with its target base
word removed and asks the learner to choose that word from four options of the
same part of speech.

Example:

```text
The vegetables are still ___.

1. fresh
2. safe
3. young
4. modern
```

The question measures recognition of a word in context. It does not measure
spelling or unaided recall.

## Learning Progression Position

Add `context_word_choice` as a distinct `QuestionType`.

The question belongs to Stage 2 because contextual recognition is more
difficult than Stage 1 meaning recognition but easier than typing a word from
memory. Stage 2 selects its question type in this order:

1. `context_word_choice` when a valid base-form example and three valid
   distractors are available.
2. `word_part_selection` when the word has at least two word parts.
3. `full_word_typing` as the final fallback.

The feature does not add a new stage or change the mapping between memory
strength and stages.

## Question Data

Extend `QuestionType` with:

```ts
'context_word_choice'
```

The generated `Question` uses existing fields:

- `exampleSentence` contains the selected source example.
- `expectedAnswer` contains the target base word.
- `mcOptions` contains exactly four options.
- `prompt` tells the learner to choose the word that best completes the
  sentence.
- `stage` remains `2`.

Attempts use:

```ts
questionType: 'context_word_choice'
inputMode: 'multiple_choice'
```

No database schema change is required because `study_attempts.question_type`
is stored as text.

## Valid Example Rules

An example is eligible only when all of these conditions hold:

1. `wordForm === 'base'`.
2. The normalized `expectedAnswer` equals the normalized target base word.
3. The expected answer occurs exactly once in the sentence.
4. The occurrence is a complete word, not part of a larger word.
5. Matching is case-insensitive.

The mask replaces only that occurrence with `___` and preserves the rest of
the sentence and its punctuation.

Examples with no whole-word occurrence or multiple occurrences are rejected.
The matching implementation must escape regex metacharacters in the answer.

Filter examples by these rules first, then rotate through the valid examples
using the existing card/session history pattern. Invalid examples do not
prevent another valid example on the same card from being used.

## Distractor Rules

The option set contains:

- one correct target base word;
- exactly three distractor base words.

Each distractor must:

1. Come from an active Learning Card in the current Study Scope.
2. Have the same normalized `partOfSpeech` as the target Meaning Card.
3. Belong to a different Word from the target.
4. Have a normalized label different from the correct answer and every other
   option.

Do not fill missing slots with another part of speech. If fewer than three
valid distractors exist, the Stage 2 fallback applies.

Candidate selection and answer placement must be deterministic for the same
card, example, queue index, and history length. Rotate the selection as history
grows so the correct answer does not remain permanently in one position.
Avoid `Math.random()` in the new builder path so tests and session behavior are
reproducible.

The authored example's `expectedAnswer` is the only correct option. The first
version does not call Gemini or add a semantic classifier to judge whether a
distractor could also sound plausible. Content fixtures and tests must use
clearly distinct meanings; richer semantic validation is future work.

## Components and Data Flow

### Context option builder

Add a small pure helper responsible for:

- normalizing and validating base-form examples;
- finding exactly one case-insensitive whole-word occurrence;
- masking the target;
- collecting same-part-of-speech distractors;
- producing four deterministic `mcOptions`;
- returning no result when any requirement is unmet.

The helper must have no React, persistence, FSRS, clock, or network dependency.
Its result is consumed by `convertQueueToQuestions`.

### Session builder

For each Stage 2 queue item, ask the context option builder for a question
candidate before selecting `word_part_selection`. Pass only active,
in-scope Words as the distractor source.

All other stages and question-selection rules remain unchanged.

### Learning session UI

Render `context_word_choice` through the existing multiple-choice interaction:

- display the masked sentence above the options;
- show four buttons with shortcuts 1–4;
- allow mouse selection and number-key selection;
- use Enter for Check, retry, and Continue;
- on an incorrect check, mark the selected option incorrect and reveal the
  correct option;
- allow the learner to choose again until correct.

The feature must preserve the existing
`Check → Retry → Answer Review → Continue` sequence.

## Scoring

### Automatic FSRS rating

Treat `context_word_choice` as a recognition question with a 12-second expected
response time:

- first-attempt correct, no hint, no reveal, and response time at or below
  18 seconds → `Good`;
- first-attempt correct with a light hint or response time above 18 seconds →
  `Hard`;
- any incorrect first attempt, retry, answer reveal, or hint level 5 →
  `Again`;
- never return `Easy` for this question type.

The common rating precedence remains authoritative: failure/retry/reveal is
evaluated before hint and timing rules.

### Skill score

Map `context_word_choice` to `context_score`.

Use the existing skill-score evidence rules:

- correct on the first attempt without a hint contributes `+10`;
- successful completion with support contributes `+4`;
- reveal and recorded error evidence apply the existing penalties;
- all skill scores remain clamped to 0–100.

`recognition_score`, `recall_score`, `spelling_score`, and
`word_structure_score` are not directly updated by this question.

## Error Handling and Fallback

Question construction must not throw for malformed content. Return no context
candidate and continue through the Stage 2 fallback when:

- example data is missing or invalid;
- `wordForm` is not `base`;
- the expected answer does not equal the target base word;
- the answer is missing from the sentence or occurs more than once;
- fewer than three unique same-part-of-speech distractors exist.

Persistence errors continue through the existing recoverable review-save UI.
This feature adds no new network request or persistence path.

## Testing

### Pure builder tests

Prove that the helper:

- accepts exactly one case-insensitive whole-word base-form occurrence;
- masks punctuation-adjacent answers correctly;
- escapes regex metacharacters;
- rejects zero, partial, and multiple occurrences;
- rejects non-base or mismatched expected answers;
- produces one correct and three unique same-part-of-speech options;
- excludes the target Word and out-of-scope/inactive candidates;
- rotates options deterministically;
- returns no result when fewer than three distractors exist.

### Session builder tests

Prove that:

- a valid Stage 2 card becomes `context_word_choice`;
- invalid context with sufficient word parts falls back to
  `word_part_selection`;
- invalid context without sufficient word parts falls back to
  `full_word_typing`;
- other stages retain their existing question types.

### UI and keyboard tests

Prove that:

- the masked sentence and four options render;
- click and number keys select an option;
- Enter checks and continues;
- an incorrect selection permits retry until correct;
- the Answer Review shows the original word and tested meaning.

### Rating, analytics, and persistence tests

Prove that:

- a first-attempt correct response within 12 seconds produces `Good`;
- a response over 18 seconds produces `Hard`;
- an incorrect attempt followed by success produces `Again`;
- the question never produces `Easy`;
- the question updates `context_score`;
- the persisted attempt uses `context_word_choice` and `multiple_choice`.

Run focused tests, the complete Vitest suite, TypeScript lint, the production
build, and `git diff --check`.

## Out of Scope

- Inflecting distractors or testing non-base word forms.
- Gemini-generated distractors.
- Semantic classification of distractor plausibility.
- A new learning stage.
- Database migrations.
- Changes to FSRS retention targets or learning/relearning steps.

