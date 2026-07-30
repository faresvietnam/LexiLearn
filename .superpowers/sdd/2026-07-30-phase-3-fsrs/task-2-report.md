# Task 2 report — FSRS scheduler persistence

Commit subject: `feat: add fsrs scheduler persistence`

Pinned the maintained stable `ts-fsrs` package at `5.4.1` (the current
`latest` release; the `6.0.0-beta.0` prerelease was intentionally excluded).
The adapter in `src/features/scheduling/fsrsScheduler.ts` owns all library
details:

- fixed `request_retention` at `0.90`;
- fixed learning steps at `10m`, then `1d`, and relearning at `10m`;
- maps the complete version-1 database row into a `ts-fsrs` card;
- maps `Again`, `Hard`, `Good`, and `Easy` into library grades;
- returns due time, stability, difficulty, current retrievability, and one
  complete persistence update;
- derives legacy `memory_score` from retrievability and never uses it as
  scheduler input.

`sessionRepository` now exposes owner-filtered read and update operations for
the complete FSRS state. The persistence write includes the due/review
timestamps, all card-state fields, retrievability, and the two legacy display
fields in one update.

The forward migration is:

`supabase/migrations/20260730064946_add_fsrs_learning_card_state.sql`

It adds ten constrained/versioned state columns, conservatively seeds any
legacy reviewed cards without pretending to reconstruct review history,
preserves the existing `learning_cards` owner policies, reasserts RLS, removes
anonymous table privileges, and explicitly grants the existing browser
operations to `authenticated`. The companion catalog/data verification script
is `supabase/tests/phase_3_fsrs_schema.sql`.

## Test-first evidence

The first focused run failed for the intended missing behavior:

- `ts-fsrs` and `fsrsScheduler` were unresolved;
- `getLearningCardSchedule` did not exist;
- `updateLearningCardSchedule` did not exist.

After the minimal implementation, the focused scheduler/repository tests
passed. Coverage includes new-card row mapping, new `Again`, new `Good`, review
`Good`, review `Again`, the exact 0.90-retention due interval, retrievability,
full serialization, reload recovery, and owner-filtered persistence.

The live pre-migration schema query returned `0` of the ten FSRS columns, which
is the expected RED state.

## Verification

- focused scheduler/repository/migration-chain tests — 16 passing;
- `npm test -- --run` — 99 passing across 17 files;
- `npm run lint` — passing;
- `npm run build` — passing (existing bundle-size warning only);
- `git diff --check` — passing;
- Supabase security advisor baseline — one pre-existing warning that leaked
  password protection is disabled;
- Supabase performance advisor baseline — pre-existing informational/warning
  items only, including the unindexed `learning_cards.personal_vocabulary_id`
  foreign key and unused `cards_user_due_idx`.

`npm audit --omit=dev` still reports two high-severity React Router advisories
from the existing pinned router dependency. `ts-fsrs` adds no transitive
dependencies; changing React Router would be an unrelated breaking upgrade and
was not included in this task.

## Live apply handoff

The remote DDL action was rejected by the database safety gate because this
worker did not have direct user authorization to mutate the named live project.
No workaround was attempted. The primary agent will apply the migration under
the user's authorization, run `supabase/tests/phase_3_fsrs_schema.sql`, and
rerun both advisor classes after apply.

There is also pre-existing migration-history drift to preserve rather than
rewrite: the remote `remove_legacy_private_word_helper` version is
`20260730040943`, while the checked-in filename is `20260730035000`.
