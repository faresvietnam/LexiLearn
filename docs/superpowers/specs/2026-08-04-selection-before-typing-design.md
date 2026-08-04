# Selection Before Typing Design

## Goal

Ensure learners recognize or select a new word before any exercise asks them
to type it.

## Stage Rules

### Stage 1

Stage 1 uses multiple-choice questions only:

- `en_to_vn_mc`: select the correct Vietnamese meaning for an English word.
- `vn_to_en_mc`: select the correct English word for a Vietnamese meaning.

Stage 1 never produces:

- `sentence_completion`
- `full_word_typing`
- `word_part_typing`
- `image_question`
- `audio_question`

Every Stage 1 question includes multiple-choice options and does not render a
typing input.

### Stage 2

Stage 2 keeps selection ahead of typing when word structure is available:

- With at least two word parts, use `word_part_selection`.
- Without sufficient word parts but with an example sentence, use
  `sentence_completion`.
- Without sufficient word parts or examples, use `full_word_typing`.

This preserves a usable fallback for words that cannot support a selection
exercise after their initial multiple-choice exposure.

### Stages 3–5

Existing behavior remains:

- Stages 3 and 4 use `word_part_typing` when at least two parts exist.
- Other Stage 3–5 cases use `full_word_typing`.

## Question Distribution

Stage 1 alternates deterministically between `en_to_vn_mc` and `vn_to_en_mc`
using queue position. This retains variation without allowing a typing question
to appear.

## Data and Persistence

No schema, persistence, FSRS scheduling, or card-stage calculation changes are
required. Only the mapping from a queue item's stage to its interactive
question type changes.

## Testing

Regression tests verify:

- A set of Stage 1 cards produces only the two multiple-choice types.
- Every Stage 1 question has `mcOptions`.
- Stage 1 never produces sentence completion even when examples exist.
- Stage 2 with word parts still produces `word_part_selection`.
- Stage 2 without word parts uses sentence completion when an example exists.
- Stage 2 without word parts or examples falls back to full-word typing.
- Existing Stage 3–5 behavior remains unchanged.

