# LexiLearn — Complete System Specification

## 0. Specification Status and Source of Truth

This document describes both the user flow already represented by the current React/Vite prototype and the target production system that will complete it.

When they differ, use this precedence:

```text
Current user-visible flow in code
→ Code-aligned rules in this document
→ Future production requirements
```

The current visible flow must be preserved unless a later product decision explicitly changes it. Missing persistence, authorization, validation, auditability, and production infrastructure are implementation gaps, not reasons to redesign that flow.

### 0.1 Current Prototype Baseline

- React 19, TypeScript, Vite, Tailwind CSS, and an Express server.
- In-memory React state initialized from mock data.
- Learner/Admin role switching for demonstration only.
- No real authentication, database, RLS, durable session state, or server-side authorization yet.
- Browser Speech Synthesis for pronunciation.
- An optional Gemini-backed `AI Auto-Fill` flow for manual word entry.

Production deployment replaces the current long-running Express server with Vercel Functions. The Gemini endpoint becomes `api/ai/analyze-word.ts`; no Express server is deployed to production.

The flow to preserve is:

- Dashboard → configure Study Scope → start a normal or extra-review session.
- Vocabulary Library → filter, inspect, edit, pause/resume/archive, move Deck, and add words.
- Add Word → link an exact normalized Global match; otherwise create a studyable Private Word directly in `pending`.
- CSV Import → preview, remove duplicate rows, review Global conflicts, confirm, and create studyable `pending` Private Words.
- Learning Session → answer, check, retry until correct, review the answer, explicitly continue.
- Admin portal → inspect pending words, approve-and-merge, or reject with a reason.

### 0.2 Current-to-Production Compatibility Rule

Production may normalize the prototype `Word` object into Global content, Private content, personal vocabulary, Learning Cards, and per-card state. This must not change the navigation or learning sequence.

Fix these prototype limitations behind the existing flow:

- Persist the updated card returned by the SRS evaluator.
- Persist settings, Study Scope, vocabulary changes, imports, submissions, and session progress.
- Replace the demo role toggle with authenticated roles and backend authorization.
- Make Global content read-only for learners while keeping personal Deck, Tags, and study status editable.
- Replace simulated approve/merge mutations with transactional backend operations.
- Remove the empty-queue demo fallback once real due/new-card state is available.

---

## 1. Product Overview

LexiLearn is a web application for learning and retaining English vocabulary using a Spaced Repetition System (SRS) inspired by Anki.

Unlike Anki, learners do not manually choose `Again`, `Hard`, `Good`, or `Easy`. The system automatically evaluates memory performance based on first-attempt correctness, response time, retry count, hint usage, error type, typing accuracy, review history, recall after increasing intervals, and performance by question type.

Primary goals:

1. Prevent forgetting previously learned vocabulary.
2. Maintain steady learning of new vocabulary.
3. Automatically adjust exercise difficulty.
4. Teach vocabulary through roots and word structure.
5. Support complete keyboard-based learning.
6. Reuse approved vocabulary across all users.
7. Keep learning state and scores separate for each user.

---

## 2. User Roles

### 2.1 Learner

A learner can:

- Sign in with Google OAuth.
- Add approved words to personal vocabulary.
- Create private words.
- Study private words immediately.
- Create and manage Decks.
- Add multiple Tags to a word.
- Configure Study Scope.
- Import vocabulary from CSV.
- Study using multiple exercise types.
- View personal progress and memory analytics.
- Pause, archive, resume, or delete private words.
- Submit private words for Admin approval.
- Continue studying rejected words privately.
- Edit any word not yet approved by Admin.

### 2.2 Admin

An Admin can:

- View all submitted private words.
- Review the entire word in one flow.
- Edit and approve a submission.
- Reject a submission with comments.
- Merge a submission with an existing Global Word.
- Manage Global Vocabulary.
- Manage meanings, word parts, example sentences, IPA, images, and audio.
- Review duplicate candidates.
- View submission versions.
- View audit logs.

Admin approval is performed for the entire word at once, not per field.

---

## 3. Authentication

### 3.1 Google OAuth

The application uses Google OAuth for login and only requests:

- Email
- Display name
- Avatar
- Google subject ID

The application does not require Gmail mailbox access.

### 3.2 Roles

```text
learner
admin
```

Role validation must be enforced in backend code and database policies, not only in the UI.

The initial production Admin is:

```text
thanghong195@gmail.com
```

This account has both Learner and Admin capabilities. Admin capability is additive: it must not remove any Learner capability. The production Admin interface is an in-app `Admin` tab in the shared navigation. The tab is present only when the authenticated role list includes `admin`; there is no standalone Admin client route. This visibility rule is navigation behavior only—backend authorization and RLS remain authoritative.

Only an existing Admin may grant or revoke Admin capability after initial provisioning.

---

## 4. Vocabulary Ownership Model

The system separates shared vocabulary content from personal learning data.

### 4.1 Global Vocabulary

Global Vocabulary contains words approved by Admin and shared across all users.

A Global Word may contain:

- Word spelling
- Normalized spelling
- Canonical key
- Language
- IPA
- Audio
- Image
- Multiple meanings
- Part of speech
- Word structure
- Word family
- Example Sentence Bank
- Approval metadata
- Version
- Status

Learners cannot directly edit an approved Global Word. Any later change should be submitted as an Edit Suggestion and reviewed by Admin.

### 4.2 Private Vocabulary

A Private Word belongs to one learner.

Possible states:

```text
draft
pending
needs_re_review
rejected
approved
merged
```

Before Admin approval, the owner has full control and can:

- Edit spelling, IPA, audio, and image.
- Add, edit, or delete meanings.
- Add, edit, or delete word parts.
- Add, edit, or delete example sentences.
- Change Deck and Tags.
- Pause, resume, archive, or delete permanently.
- Submit, cancel, or resubmit for approval.

Private Words are visible only to the owner and Admins.

### 4.3 Approved Private Word

When Admin approves a Private Word:

1. It becomes or is merged into a Global Word.
2. It is no longer maintained as a separate private vocabulary record.
3. Personal learning history remains unchanged.
4. Personal Deck and Tags remain unchanged.
5. SRS state remains unchanged.
6. Learning Card scores remain unchanged.
7. Review schedule remains unchanged.
8. The owner loses permission to edit shared content.
9. The original submission remains as an audit record marked approved or merged.

### 4.4 Rejected Private Word

When Admin rejects a word:

- The word remains private.
- The owner may continue studying it.
- It remains visible only to the owner and Admin.
- The owner retains full control.
- The Admin rejection reason is displayed.
- The owner may edit and submit it again.
- No personal learning history is lost.

---

## 5. Word, Meaning, and Learning Card Model

### 5.1 One Word, Multiple Meanings

A Word is one lexical item with shared properties such as spelling, IPA, audio, image, word structure, and word family.

Example:

```text
bank
```

Possible meanings:

- ngân hàng
- bờ sông
- nghiêng sang một bên

### 5.2 One Meaning = One Learning Card Template

Each meaning creates a separate Learning Card template.

```text
Word: bank

Card 1: ngân hàng — noun
Card 2: bờ sông — noun
Card 3: nghiêng sang một bên — verb
```

Each learner has an independent Learning Card state for every meaning. A learner may remember one meaning and forget another.

### 5.3 Show All Meanings After Answer

After answering a card, Answer Review displays:

- The meaning currently being tested.
- All other meanings of the same Word.
- IPA.
- Word structure.
- Example sentence.
- Explanation.

Only the tested Meaning Card is updated by the Scheduler. Seeing other meanings does not count as reviewing them successfully.

### 5.4 Same-Word Card Spacing

Cards from the same Word should be separated by at least one card from another Word.

```text
bank — ngân hàng
transportation
bank — bờ sông
develop
bank — nghiêng
```

If no other card is available, same-word cards may appear consecutively.

Store:

```text
same_word_gap = 0
same_word_gap = 1
same_word_gap >= 2
```

A result with `same_word_gap = 0` has lower confidence when updating memory strength.

---

## 6. Decks and Tags

### 6.1 Deck

Each personal vocabulary item belongs to exactly one Deck.

Moving a Word to another Deck does not change:

- Learning history
- SRS state
- Memory strength
- Review schedule
- Attempt history

### 6.2 Tags

A personal vocabulary item may have multiple Tags.

Examples:

```text
logistics
noun
root-port
B1
business
```

### 6.3 Personal Study Status

```text
active
paused
archived
```

Priority:

```text
Word-level status
→ Tag filtering
→ Deck filtering
→ SRS priority
```

A paused Word never appears in a session even when its Deck and Tags are enabled.

---

## 7. Study Scope

Study Scope determines which vocabulary is eligible for learning.

It includes:

- Active Decks
- Excluded Tags
- Paused Words
- Active Words
- Total eligible Learning Cards

MVP Study Scope uses exclusion-only Tag filtering. A Word with any excluded Tag is not eligible for the session. Included-Tag filtering is explicitly out of MVP scope.

### 7.1 Default Scope

Each user has one saved default Study Scope.

The Dashboard displays:

- Active Deck count
- Excluded Tag count
- Active Word count
- Due Reviews
- New Words available

### 7.2 Quick Change

The user can quickly change Study Scope before learning.

When selecting `Save & Apply`:

- The new scope applies immediately.
- The new scope becomes the default.
- There is no temporary-session-only mode.

---

## 8. Daily Limits

Settings include:

```text
New Words Per Day
Review Limit Per Day
```

### 8.1 New Word Limit

Defines the maximum number of new Learning Cards introduced per day.

### 8.2 Review Limit

The Review Limit is calculated by Learning Card, not by Word.

```text
30 review cards
24 unique words
```

Retries for the same Learning Card during one session do not consume additional quota.

### 8.3 Priority

The session prioritizes:

1. Overdue reviews
2. Critical forgetting risk
3. Reviews due today
4. Recently failed cards
5. Weak memory cards
6. New cards

The system protects old vocabulary before introducing new vocabulary.

### 8.4 Extra Review

When Review Limit is reached but high-risk cards remain, show:

- Finish for today
- Review more at-risk words

Extra Review:

- Does not change the saved Review Limit.
- Does not introduce new words.
- Only includes highest-risk review cards.
- Is shown separately in analytics.

### 8.5 Learner Timezone and Study Day

Each user stores an IANA timezone. The default is:

```text
Asia/Ho_Chi_Minh
```

The learner's study day begins at `04:00` in that timezone. New-card limits, review limits, daily analytics, `tomorrow`, due labels, and review forecasts must use this local study-day boundary rather than UTC midnight.

---

## 9. Learning Progression

The system automatically selects difficulty based on memory performance rather than using a fixed sequence.

### 9.1 Recognition

- English to Vietnamese multiple choice
- Vietnamese to English multiple choice
- Image to Word
- Sentence completion multiple choice

### 9.2 Word-Part Selection

The learner selects word parts:

```text
trans + port + ation
```

Supported types:

```text
prefix
root
base
suffix
combining_form
compound_component
```

### 9.3 Word-Part Typing

```text
[ trans ] + [ port ] + [ ation ]
```

### 9.4 Partial Assistance

The system gradually reduces help:

- Provide some parts.
- Show only the Root.
- Show the number of parts.
- Show first letters.
- Hide structure but allow Hint.

### 9.5 Full-Word Typing

The learner types the complete target word from:

- Vietnamese meaning
- Image
- Audio
- Sentence with a blank

### 9.6 Adaptive Regression

```text
Full-word typing
→ Word-part typing
→ Word-part selection
→ Multiple choice
```

---

## 10. Question Types

Current code identifiers:

```text
en_to_vn_mc
vn_to_en_mc
sentence_completion
word_part_selection
word_part_typing
full_word_typing
```

Reserved future identifiers:

```text
image_question
audio_to_word
```

`sentence_completion` currently uses a typed missing-word answer. A future multiple-choice presentation may be added within the same exercise family.

### 10.1 Sentence Completion

There is no exercise requiring the learner to write a full sentence.

The system shows a sentence with one missing target word:

```text
The goods were ______ by truck.
```

The learner only enters or selects the missing word.

The expected answer may be an inflected form:

```text
transport
transports
transported
transporting
```

Each sentence stores:

- Meaning Card
- Base Word
- Expected Answer
- Word Form
- Part of Speech
- Difficulty
- Approval Status

---

## 11. Example Sentence Bank

Each Meaning Card has multiple example sentences.

```text
Meaning: ngân hàng

I deposited money at the bank.
The bank approved her loan.
The bank closes at five.
```

Selection rules:

- Avoid immediate repetition.
- Prefer less recently shown sentences.
- Track sentence-level error rate.
- Track difficulty.
- Track times shown.
- Track last shown timestamp.

Only approved Global Example Sentences are shared across users. Private Words may use private example sentences immediately.

---

## 12. Retry Until Correct

The learner continues until the answer is correct.

The system evaluates the entire retry process, not only the final answer.

```text
Attempt 1: wrong
Attempt 2: wrong root
Attempt 3: correct after hint
```

The system distinguishes:

```text
completion
independent_recall
failed_recall
```

### 12.1 Hint Progression

- Attempt 1 wrong: show error only.
- Attempt 2 wrong: automatically open Hint Level 1.
- Later wrong attempts: increase Hint Level.
- The learner may press H to open Hint manually.

Hint levels:

1. Show number of characters or word parts.
2. Show first letter.
3. Explain Prefix, Root, or Suffix.
4. Switch to word-part selection.
5. Reveal answer and require retyping.

### 12.2 After Answer Reveal

- The learner must type the answer correctly.
- It counts as Completion.
- It does not count as independent recall.
- The Scheduler receives `failed_recall`.

---

## 13. Correct and Incorrect Flow

Both correct and incorrect answers require explicit Continue.

```text
Answer
→ Check
→ Feedback
→ Continue
→ Next Question
```

The system never automatically moves to the next question.

### 13.1 Correct Answer

Show:

- Correct indicator
- Word
- Tested meaning
- Other meanings
- IPA
- Word structure
- Example sentence
- Explanation
- Next review information when appropriate

### 13.2 Incorrect Multiple Choice

Current flow:

- Mark the selected wrong option and the correct option.
- Keep the learner on the same question.
- Allow another selection and another Check.
- Do not open Answer Review until the learner answers correctly.
- After correctness, show the tested meaning, other meanings, word structure, and explicit Continue.

This retry behavior takes precedence over any interpretation that a wrong multiple-choice answer immediately advances to Answer Review.

### 13.3 Incorrect Typing

- Do not reveal the full answer immediately.
- Show Character Diff.
- Show error type.
- Increase Hint after repeated errors.
- Require retry until correct.
- Open Answer Review only after correctness or forced retyping after reveal.

### 13.4 Incorrect Word-Part Typing

- Keep correct parts.
- Mark incorrect parts.
- Move focus to the first incorrect field.
- Reveal more help gradually.

---

## 14. Keyboard-First Interaction

The entire Learning Session must work without a mouse.

### 14.1 Global Shortcuts

```text
Enter       Check or Continue, depending on state
1–9         Select answer
A–I         Alternative answer shortcuts
H           Open Hint
P           Play audio
Tab         Move focus forward
Shift+Tab   Move focus backward
Esc         Pause session
Backspace   Remove last selected word part
```

### 14.2 Multiple Choice

- Press 1–4 to select.
- Press Enter to Check.
- Press Enter again to Continue.
- One Enter press must never both Check and Continue.

### 14.3 Typing

- Input is autofocused.
- Enter checks.
- If wrong, edit and retry.
- If correct, Answer Review opens.
- Enter continues.

### 14.4 Word-Part Typing

- Tab or Arrow Right moves forward.
- Shift+Tab or Arrow Left moves backward.
- Enter checks all parts.
- On error, focus moves to the first wrong part.

---

## 15. Character Diff

Typing comparison is case-insensitive:

```text
Bank = bank = BANK
```

Leading and trailing spaces may be trimmed.

The system still evaluates:

- Internal spaces
- Hyphens
- Apostrophes
- Periods
- Commas
- Special characters

Examples:

| Correct | Submitted | Result |
|---|---|---|
| bank | Bank | Correct |
| ice cream | icecream | Incorrect |
| well-known | well known | Incorrect |
| don't | dont | Incorrect |
| U.S. | US | Incorrect |
| bank | ` bank ` | Correct after trim |

### 15.1 Visual Diff

- Correct characters: green.
- Incorrect, missing, or extra characters: red.
- Also use underline, icons, or markers.
- Do not rely on color alone.

Supported error types:

```text
missing_character
extra_character
replacement
transposition
incorrect_space
incorrect_special_character
incorrect_word_part
```

The backend returns a structured diff; the frontend renders it.

---

## 16. Memory Scoring

One Word-level score is not sufficient.

Store per-user, per-Learning-Card skill scores:

```text
recognition_score
recall_score
spelling_score
context_score
word_structure_score
overall_memory_strength
```

The Dashboard may show only `overall_memory_strength`, while the Question Engine uses the detailed scores.

`memoryScore` is a display and analytics value only. It must never be the sole input that determines the next review date. In the FSRS implementation, the displayed score is derived from current retrievability:

```text
memoryScore = round(retrievability * 100)
```

The UI does not display a separate readiness or decay score. For each Learning Card, it displays only:

```text
Predicted recall: {memoryScore}%
Review again: {relative_due_time}
```

Examples:

```text
Predicted recall: 94%
Review again: in about 2 days

Predicted recall: 90%
Review again: due now
```

---

## 17. SRS Scheduler

The SRS Scheduler is isolated from the UI and API controllers.

### 17.1 Scheduler Input

```text
Learning Card State
First Attempt Result
Response Time
Retry Count
Hint Usage
Question Type
Input Mode
Same Word Gap
Answer Revealed
Error Type
Automatic FSRS Rating
```

### 17.2 Scheduler Output

```text
Updated Memory Strength
Updated Skill Scores
Updated Stability
Updated Difficulty
Updated Retrievability
Next Review Date
Recommended Question Type
Forgetting Risk
```

### 17.3 Card State

```text
stability
difficulty
retrievability
last_reviewed_at
next_review_at
review_count
lapse_count
scheduler_version
desired_retention
fsrs_state
```

`scheduler_version` is mandatory so the algorithm can evolve safely.

### 17.4 Prototype Rule Mapping

```text
Correct first attempt, fast, no hint
→ strong success

Correct first attempt, slow
→ normal success

Minor typo then correct
→ weak success

Hint required
→ lapse

Answer revealed
→ failed recall
```

This prototype-only mapping is replaced by the automatic FSRS rating mapping in Section 17.5 when persistent scheduling is implemented.

Current prototype note:

- `evaluateSrsAttempt` calculates score, interval, memory strength, next review date, error rate, and history.
- Learning Session calls it after correct completion, including completion after retries.
- Its returned `updatedCard` is not yet written back to application state. Production must persist it while preserving the retry and Answer Review flow.
- Evaluation must use the complete attempt path: first-attempt correctness, retries, highest hint level, response time, and accumulated error types.

### 17.5 Automatic FSRS Rating

LexiLearn uses the [Free Spaced Repetition Scheduler (FSRS)](https://docs.ankiweb.net/deck-options.html#fsrs) with:

```text
desired_retention = 0.90
```

The learner does not choose `Again`, `Hard`, `Good`, or `Easy`. The system derives one automatic rating from the complete attempt path and then passes it to FSRS. The rating represents recall evidence, not user satisfaction.

#### 17.5.1 Recorded Attempt Input

```text
question_type
is_first_attempt_correct
attempts_count
hint_level_used
answer_revealed
response_time_ms
expected_answer_length
```

`response_time_ms` starts when the question becomes active and ends at the first correct response or answer reveal. Time while the browser tab is not visible must be excluded or capped before it reaches the Scheduler.

#### 17.5.2 Expected Response Time

LexiLearn normalizes speed by question type before assigning a rating:

```text
en_to_vn_mc, vn_to_en_mc       = 7 seconds
word_part_selection            = 12 seconds
sentence_completion            = max(12, expected_answer_length × 0.8) seconds
word_part_typing               = max(15, expected_answer_length × 1.0) seconds
full_word_typing               = max(12, expected_answer_length × 0.9) seconds
```

```text
speed_ratio = response_time_ms / expected_response_time_ms
fast        = speed_ratio <= 0.6
normal      = speed_ratio > 0.6 and <= 1.5
slow        = speed_ratio > 1.5
```

These are initial global defaults. Once a user has sufficient review history, the system may replace them with that user's median response time by question type. This calibration must not change past review records.

#### 17.5.3 Rating Rules

```text
answer_revealed = true or hint_level_used >= 5
→ Again

is_first_attempt_correct = false or attempts_count > 1
→ Again

first attempt correct and hint_level_used >= 3
→ Hard

first attempt correct and hint_level_used is 1 or 2
→ Hard when slow; otherwise Good

first attempt correct, no hint, and slow
→ Hard

first attempt correct, no hint, recognition question
→ Good

first attempt correct, no hint, typed recall question, and fast
→ Easy

first attempt correct, no hint, typed recall question, and normal
→ Good
```

Recognition questions are `en_to_vn_mc`, `vn_to_en_mc`, and `word_part_selection`. They can never produce `Easy`, because recognition alone does not prove independent recall or spelling. Typed recall questions are `sentence_completion`, `word_part_typing`, and `full_word_typing`.

Any incorrect first attempt is `Again`, even if the learner later retries correctly. Retry proves that feedback was completed, but not that the target was independently recalled when tested. This follows the FSRS distinction between failure (`Again`) and successful but effortful recall (`Hard`).

#### 17.5.4 Scheduling Contract

The automatic rating is passed with the current FSRS card state and review timestamp to an FSRS implementation. FSRS, not UI code, calculates the next due timestamp and updated memory state:

```text
input:  fsrs_state + automatic_rating + reviewed_at + desired_retention
output: due_at + stability + difficulty + retrievability + fsrs_state
```

At `desired_retention = 0.90`, the selected interval is the interval at which the model predicts a 90% chance of successful recall when the card is due. Higher retention targets require more reviews; 90% is Anki's documented default balance between retention and workload. [Anki FSRS guide](https://docs.ankiweb.net/deck-options.html#fsrs)

#### 17.5.5 Learning and Relearning Steps

FSRS controls long-term review intervals. LexiLearn uses short steps before a card enters or returns to long-term review:

```text
New
→ 10 minutes
→ 1 day
→ FSRS Review

Again or answer reveal
→ retry in the current question
→ 10 minutes
→ 1 day
→ FSRS Review
```

The retry in the current Learning Session completes the exercise flow; it does not erase the failure signal. The 10-minute reappearance is the first independent check after feedback. This matches the distinction between learning/relearning steps and long-term review in the [Anki Manual](https://docs.ankiweb.net/deck-options.html#learning-steps).

#### 17.5.6 Meaning and Word Mastery

FSRS does not produce a binary `memorized` flag. LexiLearn uses these product labels:

```text
Learning       = fsrs_state is new, learning, or relearning
Strengthening  = latest rating is Again or predicted recall at due time is below 90%
Stable         = fsrs_state is review and predicted recall at due time is at least 90%
Mastered       = fsrs_state is review, the latest successful scheduled review is Good or Easy,
                 no hint or retry was used, and the card's interval is at least 14 days
```

A Word is `Mastered` only when every active Meaning Card for that Word is `Mastered`.

#### 17.5.7 Scheduler UI Presentation

The Answer Review, Word Detail, and Dashboard must present the calculated schedule in learner language:

```text
Predicted recall: {round(retrievability × 100)}%
Review again: {relative_due_time}
```

`relative_due_time` is calculated from `due_at` and may be displayed as `in 10 minutes`, `tomorrow`, `in about 2 days`, `due now`, or `overdue by 3 days`. It must not be labelled as a score, an expiry date, or proof that the learner has forgotten the card.

---

## 18. Forgetting Risk

Forgetting Risk should consider:

- Overdue duration
- Memory strength
- Stability
- Retrievability
- Review interval
- Recent failures
- First-attempt accuracy
- Hint usage
- Response time
- Same-word gap confidence

UI categories:

```text
Strong
Stable
Weak
Critical
```

---

## 19. Learning Session Generation

```text
Load default Study Scope
→ Exclude every Word whose word-level status is not Active
→ Include selected Decks; an empty selection means all Decks
→ Exclude Words containing any excluded Tag
→ Split Meaning Cards into reviewed and new
→ Include reviewed cards due today or overdue
→ Derive exercise stage from Memory Strength
→ Sort reviews by ascending Memory Score
→ Apply Review Limit by Meaning Card
→ If any eligible due review is Critical, add no new cards
→ Otherwise apply New Word Limit to new Meaning Cards
→ Mix up to 4 reviews followed by 1 new card
→ Separate cards from the same Word when another Word is available
→ Build Session Queue
```

Queue priority:

```text
Overdue Critical Cards
High Forgetting Risk
Due Today
Recent Lapses
Weak Cards
New Cards
```

Suggested mixing when backlog is acceptable:

```text
4 review cards
→ 1 new card
→ 4 review cards
→ 1 new card
```

Session statuses:

```text
active
paused
completed
abandoned
```

Current stage mapping:

```text
Critical or unclassified → Stage 1
Weak                     → Stage 2
Stable                   → Stage 3
Strong                   → Stage 5
```

Stage 4 is retained for future partial assistance; the prototype renders it through the Stage 3 word-part typing UI.

Extra Review includes only reviewed `Critical` and `Weak` cards, applies the saved review limit, and introduces no new cards.

The prototype empty-queue fallback inserts the first meaning of active Words for demo purposes. Remove that fallback when durable learning state is implemented; a normal production session must not introduce unrelated non-due reviews.

---

## 20. Manual Word Entry

Required fields:

```text
Word
Vietnamese Meaning
Part of Speech
```

Optional fields:

```text
IPA
Audio
Image
Multiple Meanings
Example Sentence Bank
Word Parts
Word Family
Tags
Deck
```

### 20.1 Existing Global Word

```text
Normalize input
→ Search Global Vocabulary
→ Search learner's Private Words
```

If Global Word exists:

- Show all existing data.
- Do not ask the user to recreate fields.
- Allow `Add to My Vocabulary`.
- Let the learner choose Deck and Tags.
- Create personal Learning Cards.

### 20.2 New Word

If no Global Word exists:

- Create a Private Word with the selected Deck and Tags.
- Create one initial Meaning Card.
- Mark it `active` and submit it directly as `pending`.
- Add it to personal learning immediately.
- Allow editing while it remains unapproved.

The `draft` state remains valid for future autosave, incomplete imports, or an explicit save-without-submit capability. It must not add a mandatory step to the current Add Word flow.

---

## 21. Word Structure

Word structure is a flexible ordered list.

Each part stores:

```text
text
type
meaning
position
```

Supported types:

```text
prefix
root
base
suffix
combining_form
compound_component
```

Examples:

```text
un + believe + able
micro + scope
pay + check
trans + port + ation
```

The system must not assume every word follows Prefix–Root–Suffix.

---

## 22. CSV Import

```text
Upload
→ Parse
→ Preview
→ Map Columns
→ Normalize
→ Validate
→ Remove CSV Duplicates
→ Match Existing Words
→ Review Conflicts
→ Confirm
→ Import
```

### 22.1 Duplicate Rows Inside CSV

- Keep the first row.
- Remove later duplicate rows.
- Do not merge duplicate rows.
- Show a Duplicate Report.
- Allow report download.

### 22.2 Existing Global Word

- Do not create a duplicate.
- Link the Global Word to Personal Vocabulary.
- Never directly update Global Vocabulary from learner CSV.
- If imported content is identical to the Global Word, link it directly.
- If any imported meaning or shared-content field differs, create an Edit Suggestion and link the existing Global Word.

### 22.3 Existing Private Word

- Do not add another copy.
- Report it as duplicate.
- Allow review of the existing word.

### 22.4 New Word

- Create Private Word.
- Add to Personal Vocabulary.
- Allow immediate study.
- Allow later Admin submission.

### 22.5 Conflict Rules

For editable Private Words:

- Fill empty fields automatically.
- Ignore identical values.
- Show differing fields in Conflict Review.
- Let the learner choose `Keep current` or `Use imported`.

For approved Global Words:

- Never overwrite directly.
- Convert differences into Edit Suggestions.

### 22.6 Import Status

```text
uploaded
validating
ready
importing
completed
failed
```

---

## 23. Duplicate Detection

Duplicate detection must not rely only on lowercase spelling.

A `canonical_key` may include:

```text
normalized spelling
language
lexical type
pronunciation group when needed
```

Admin resolves uncertain candidates, including homographs and punctuation variants.

---

## 24. Submission and Approval Flow

### 24.1 User Flow

```text
Create or import Private Word
→ Pending
→ Study Immediately while Pending
→ Approved or Rejected
```

A future Draft/autosave flow may allow explicit submission later, but default Add Word and CSV Import remain direct-to-Pending.

### 24.2 Editing During Pending

The owner may continue editing in the current flow. With versioned persistence, each edit must increment the submission version and ensure Admin reviews the latest saved snapshot.

```text
pending
→ needs_re_review
```

`needs_re_review` is a future persisted state. The prototype currently exposes only `draft`, `pending`, `rejected`, and `approved`; adding `needs_re_review` and `merged` must remain backward-compatible.

### 24.3 Optimistic Locking

Each submission stores:

```text
submission_version
```

Admin approval must verify that the open version is current. If not, approval is blocked until reload.

### 24.4 Admin Actions

```text
Approve
Edit & Approve
Reject
Merge with Existing
```

The current portal exposes Approve & Merge and Reject. Separate edit-before-approve and merge-target selection remain future moderation capabilities.

### 24.5 Approval Transaction

```text
Lock submission version
→ Create or match Global Word
→ Create or map Global Meanings
→ Map Example Sentences
→ Map Word Parts
→ Re-link User Vocabulary
→ Re-link Learning Cards
→ Preserve Learning State
→ Mark Private Word as merged
→ Write Audit Log
```

### 24.6 Rejection

The owner may continue studying, edit, resubmit, archive, or delete permanently.

---

## 25. Admin Moderation

Admin review displays:

- Word
- Owner
- Submission version
- IPA
- Meanings
- Part of speech
- Word Parts
- Example Sentences
- Images
- Audio
- Word Family
- Duplicate candidates
- Validation warnings
- Previous rejection comments
- Diff from previous version

Admin approves the entire Word in one action.

---

## 26. Dashboard

### 26.1 Today Overview

- Reviews Due
- At-risk Words
- New Words Available
- Daily Progress
- Estimated Study Time

### 26.2 Continue Learning Card

- Current Study Scope
- Active Decks
- Included Tags
- Total Words
- Today's status
- Session progress
- Estimated time left

Actions:

- Continue Learning
- Change Scope

### 26.3 Memory Strength

```text
Strong
Stable
Weak
Critical
```

Use a stacked bar chart and allow navigation to filtered vocabulary.

### 26.4 Review Forecast

Show expected review volume for 7 and 30 days, with Review Limit reference.

### 26.5 Frequently Forgotten Words

Rank by recent evidence:

- Lapse rate
- First-attempt Error Rate
- Hint usage
- Weak Part
- Next Review

### 26.6 Learning Activity

- Review Cards completed
- New Cards learned
- First-attempt Accuracy
- Study Time
- Extra Review

### 26.7 Root Word Insights

- Most forgotten Prefix
- Most forgotten Root
- Most forgotten Suffix
- Weak Word Families
- Suggested practice

---

## 27. Analytics Metrics

Do not use final completion accuracy because every card eventually becomes correct.

Primary metrics:

```text
first_attempt_accuracy
average_retry_count
hint_usage_rate
lapse_rate
retention_rate
review_completion_rate
new_words_learned
study_time
extra_review_count
```

Frequently Forgotten ranking uses recent 30-day evidence rather than lifetime error count.

---

## 28. Recommended Technology Stack

### 28.1 Current Application Baseline

- TypeScript
- React
- Vite
- Tailwind CSS
- Express
- Gemini API for optional word analysis
- Browser Speech Synthesis

Do not require a Next.js rewrite merely to execute this plan. The existing React/Vite flow is the frontend baseline.

### 28.2 Target Production Services

- PostgreSQL, Auth, Storage, and Row Level Security, with Supabase as the preferred managed platform.
- Vercel Functions for server-only API operations. The Gemini analysis endpoint is `api/ai/analyze-word.ts`.
- Zod or equivalent runtime validation at API boundaries.
- Database transactions, idempotency, audit logs, and background jobs.
- Google OAuth through the selected authentication provider.
- A maintained TypeScript FSRS library is required for scheduling; LexiLearn owns only the automatic behavior-to-rating mapping defined in Section 17.5.

### 28.3 Deployment

- Deploy the Vite frontend and Vercel Functions on Vercel Hobby for personal, non-commercial use only.
- Use Supabase for Database, Auth, and Storage if this recommendation is accepted.
- Treat any future framework migration as a separate architectural decision.

Environments:

```text
local
development
staging
production
```

---

## 29. Core Database Tables

### users

```text
id
auth_user_id
email
display_name
avatar_url
timezone
study_day_starts_at
created_at
```

Default values:

```text
timezone = Asia/Ho_Chi_Minh
study_day_starts_at = 04:00
```

### user_roles

```text
user_id
role                 // learner | admin
granted_by_user_id nullable
created_at
```

Every user receives the `learner` role. `thanghong195@gmail.com` receives both `learner` and `admin` during the initial migration. Admin authorization requires an `admin` role record.

### user_settings

```text
user_id
new_words_per_day
review_limit_per_day
hint_behavior
audio_autoplay
theme
language
reduced_motion
char_diff_accessibility
updated_at
```

### app_settings

```text
key
integer_value
updated_by_admin_id
updated_at
```

Required initial setting:

```text
key = gemini_auto_fill_daily_limit
integer_value = 10
```

Only Admins may update `app_settings`.

### ai_auto_fill_usage

```text
user_id
study_date
request_count
updated_at
```

`study_date` is calculated using the user's timezone and 04:00 study-day boundary. The Vercel Function rejects requests after the configured daily limit and returns a manual-entry fallback response.

### global_words

```text
id
word
normalized_word
canonical_key
language
ipa
audio_url
image_url
status
version
created_by_admin_id
created_at
updated_at
```

### word_meanings

```text
id
global_word_id
meaning_vi
part_of_speech
definition_en
usage_note
display_order
status
version
```

### word_parts

```text
id
global_word_id
text
type
meaning
position
```

### example_sentences

```text
id
meaning_id
sentence
sentence_vi
expected_answer
word_form
difficulty
status
last_shown_at
times_shown
created_at
```

### private_words

```text
id
owner_user_id
word
normalized_word
ipa
audio_url
image_url
status
submission_version
admin_comment
merged_global_word_id
created_at
updated_at
```

Private meanings, parts, and sentences should use corresponding private tables.

### user_vocabulary

```text
id
user_id
global_word_id nullable
private_word_id nullable
deck_id
study_status
added_at
archived_at
```

Constraint: exactly one of `global_word_id` or `private_word_id` is set.

### decks

```text
id
user_id
name
description
is_active
created_at
```

### tags

```text
id
user_id
name
created_at
```

### user_vocabulary_tags

```text
user_vocabulary_id
tag_id
```

### learning_cards

```text
id
user_id
user_vocabulary_id
meaning_source_id
meaning_source_type
status
created_at
```

Meaning source types:

```text
global_meaning
private_meaning
```

### card_learning_state

```text
learning_card_id
memory_strength
recognition_score
recall_score
spelling_score
context_score
word_structure_score
stability
difficulty
retrievability
review_count
lapse_count
last_reviewed_at
next_review_at
scheduler_version
desired_retention
fsrs_state
```

### learning_sessions

```text
id
user_id
started_at
ended_at
scope_snapshot
review_limit
new_word_limit
status
```

### session_queue_items

```text
id
session_id
learning_card_id
question_type
priority
queue_order
same_word_gap
state
```

### review_attempts

```text
id
user_id
learning_card_id
session_id
question_type
input_mode
attempt_number
submitted_answer
is_correct
first_attempt
response_time_ms
hint_level
answer_revealed
automatic_fsrs_rating
edit_distance
error_type
created_at
```

### imports

```text
id
user_id
file_name
status
total_rows
valid_rows
duplicate_rows
error_rows
created_at
completed_at
```

### edit_suggestions

```text
id
user_id
global_word_id
suggested_changes
status
admin_comment
created_at
updated_at
```

### admin_audit_logs

```text
id
admin_id
action
entity_type
entity_id
before_snapshot
after_snapshot
created_at
```

---

## 30. Row Level Security

Learners may:

- Read active Global Vocabulary.
- Read and write their own Private Words.
- Manage their own Decks and Tags.
- Manage their own Personal Vocabulary.
- Manage their own Learning Cards and attempts.
- Read their own imports and suggestions.

Admins may:

- Read all submissions.
- Manage Global Vocabulary.
- Approve, reject, or merge submissions.
- Review Edit Suggestions.
- Read Admin Audit Logs.

All sensitive mutations also validate authorization in backend code.

---

## 31. API Modules

```text
/auth
/dashboard
/vocabulary
/private-words
/submissions
/decks
/tags
/study-scope
/learning-sessions
/review-attempts
/imports
/edit-suggestions
admin operations
```

Important mutations require:

- Authentication
- Authorization
- Zod validation
- Database transaction
- Idempotency where appropriate
- Audit logging for Admin actions

---

## 32. Background Jobs

Recommended jobs:

- CSV parsing and validation
- Duplicate detection
- Review Forecast aggregation
- Forgetting Risk recalculation
- Analytics aggregation
- Submission merge
- Abandoned session cleanup
- Deprecated Meaning handling
- Import report generation
- Notification generation

Jobs must be idempotent.

---

## 33. System Risks and Resolutions

### 33.1 SRS Algorithm Not Finalized

Use a versioned Scheduler interface, begin with rules, store FSRS-compatible fields, and calibrate later with real data.

### 33.2 Word-Level Score Is Too Simple

Store skill-specific scores per Learning Card.

### 33.3 Review Limit Ambiguity

Count Review Limit by Learning Card. Retries do not consume additional quota.

### 33.4 CSV Could Bypass Admin Approval

CSV never directly updates Global Vocabulary. Differences become Edit Suggestions.

### 33.5 Duplicate Matching Is Complex

Use canonical keys and Admin duplicate review.

### 33.6 Concurrent Submission Editing

Use submission versioning and optimistic locking.

### 33.7 Retry Until Correct Can Trap a Learner

Progressive Hint eventually reveals the answer and requires retyping; store as failed recall.

### 33.8 Admin Approval Bottleneck

Support Edit & Approve, Reject with comments, and Merge with Existing.

### 33.9 Sentence Memorization

Use sentence banks, track usage, rotate examples, and store sentence difficulty.

---

## 34. Implementation Phases

These phases start from the current prototype, not from an empty repository.

### Phase 1 — Stabilize the Existing Prototype Flow

Implementation spec and completed plan: [`docs/superpowers/specs/2026-07-29-phase-1-prototype-stabilization.md`](docs/superpowers/specs/2026-07-29-phase-1-prototype-stabilization.md) and [`docs/superpowers/plans/2026-07-29-phase-1-prototype-stabilization.md`](docs/superpowers/plans/2026-07-29-phase-1-prototype-stabilization.md).

- Preserve the current React/Vite navigation and component flow.
- Add automated tests for Study Scope filtering, session generation, same-word spacing, retry behavior, Character Diff, and SRS evaluation.
- Write returned SRS card state back into application state.
- Accumulate error types across retries.
- Correct final-question statistics and extra-review statistics.
- Remove the demo empty-queue fallback after fixtures provide explicit due/new data.

### Phase 2 — Persistence and Authentication

- Add Google OAuth and authenticated learner/admin roles.
- Provision `thanghong195@gmail.com` with both Learner and Admin roles and expose the in-app `Admin` tab only when the authenticated role list includes `admin`.
- Create migrations for Global Words, Private Words, personal vocabulary, Meaning Cards, SRS state, Decks, Tags, Study Scope, sessions, and attempts.
- Add user timezone, 04:00 study-day boundary, user settings, Admin-configurable Gemini quota, and quota-usage records.
- Add RLS and matching server-side authorization.
- Persist settings, Study Scope, vocabulary edits, statuses, Decks, Tags, and session progress.
- Keep shared content separate from personal learning state.

### Phase 3 — Persist the Existing Vocabulary and Learning Flows

- Persist Manual Add Word with exact Global duplicate linking and direct-to-Pending private creation.
- Replace the Express Gemini endpoint with the authenticated, quota-enforced Vercel Function.
- Make approved Global content read-only while keeping personal Deck, Tags, and study status editable.
- Persist Learning Cards and the current stage mapping.
- Persist queues, retries, hints, response time, Character Diff errors, and Answer Review completion.
- Implement automatic FSRS rating, 90% desired retention, and the 10-minute/1-day learning and relearning steps.
- Resume paused sessions without changing the answer/check/retry/review/continue sequence.
- Version the initial Scheduler interface.

### Phase 4 — CSV and Moderation

- Replace the prototype CSV parser with robust upload, column mapping, validation, duplicate reporting, and resumable import records.
- Preserve conflict review and the direct-to-Pending import result.
- Ensure CSV never overwrites Global content; turn proposed differences into Edit Suggestions.
- Implement transactional approve, reject, and merge operations.
- Add merge-target selection, Edit & Approve, submission versions, optimistic locking, and Admin audit logs.

### Phase 5 — Adaptive Learning and Content Expansion

- Calibrate response-time baselines and optimize FSRS parameters from each user's stored review history.
- Add detailed recognition, recall, spelling, context, and word-structure scores without using them as a replacement for FSRS scheduling.
- Activate Stage 4 partial assistance and adaptive regression.
- Add image and audio question types.
- Add sentence-bank rotation and sentence-level performance.
- Replace score-only prioritization with versioned forgetting-risk inputs while preserving the Critical-first policy.

### Phase 6 — Dashboard, Analytics, and Root Insights

- Today Overview
- Continue Learning summary
- Memory Strength
- Review Forecast
- Frequently Forgotten Words
- Learning Activity
- Root Word Insights
- Active Scope Summary

### Phase 7 — Hardening

- Accessibility testing
- Keyboard testing
- Security and RLS testing
- Scheduler calibration
- CSV load testing
- Performance optimization
- Monitoring
- Backup and recovery
- Error tracking
- Production readiness

---

## 35. MVP Scope

### 35.1 Prototype Already Represented in Code

- React/Vite application shell and navigation
- Mock Global and Private Vocabulary
- Manual Word Entry with exact Global duplicate detection
- Direct-to-Pending Private Word creation
- Admin Approve & Merge and Reject simulation
- One Deck and multiple Tags per Word
- Study Scope with active Decks and excluded Tags
- New-card and review-card limits
- Multiple Choice, Word-Part Selection, Word-Part Typing, Full-Word Typing, and typed Sentence Completion
- Character Diff, Retry Until Correct, Progressive Hint, and keyboard-first Learning Screen
- Rule-based SRS calculation
- Dashboard, Vocabulary Library, Settings, Progress, and Root Word Insights
- CSV preview, duplicate removal, conflict choice, and import simulation

### 35.2 Production MVP Remaining Work

- Google OAuth
- Durable Global, Private, and personal learning data
- Backend authorization and RLS
- Durable Study Scope, settings, Decks, Tags, imports, submissions, sessions, and attempts
- Persisted Scheduler results and resumable sessions
- Admin-only in-app tab, Admin provisioning, and Admin-configurable Gemini Auto-Fill quota
- Transactional Admin Approve, Reject, and Merge
- Global-content edit restrictions with personal metadata still editable
- Robust CSV validation and non-overwriting conflict handling
- Automated flow, keyboard, accessibility, security, and scheduler tests

Later phases:

- Advanced FSRS calibration
- Expanded AI-generated content beyond the current optional Auto-Fill
- Audio pronunciation scoring
- Advanced word-family analytics
- Complex batch conflict resolution
- Public user edit suggestions
- Advanced notifications

---

## 36. Final Agreed Principles

1. Shared vocabulary content and personal learning data are separate.
2. Each Word may contain multiple Meaning Cards.
3. Every learner has an independent SRS state per Meaning Card.
4. Each personal vocabulary item belongs to one Deck and multiple Tags.
5. Study Scope is saved as default after every quick change.
6. Old vocabulary is prioritized before new vocabulary.
7. Review Limit is counted by Learning Card.
8. Retry continues until correct.
9. The entire retry path affects memory evaluation.
10. Answer reveal counts as failed recall.
11. Correct and incorrect answers both require Continue.
12. Learning can be completed entirely with keyboard controls.
13. Character comparison is case-insensitive but evaluates internal spaces and special characters.
14. Private Words may be studied immediately.
15. Rejected Words remain private and studyable.
16. Owners have full control over unapproved Words.
17. Admin approves the entire Word in one action.
18. Approved content becomes shared and read-only for learners.
19. CSV never directly overwrites Global Vocabulary.
20. SRS logic is versioned and isolated in a Scheduler module.
21. LexiLearn automatically maps answer behavior to FSRS ratings; learners do not choose Again, Hard, Good, or Easy.
22. FSRS schedules each Meaning Card at a 90% desired recall probability.
23. A Word is Mastered only when every active Meaning Card meets the Mastered rule.
