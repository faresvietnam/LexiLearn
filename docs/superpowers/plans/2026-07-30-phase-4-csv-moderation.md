# Phase 4 plan — CSV persistence (moderation retired)

This plan supersedes the earlier CSV-moderation proposal. CSV import still validates, deduplicates, persists resumable rows, links exact Global matches, and creates owner-scoped Private Words. It no longer creates pending submissions or Edit Suggestions and no administrator approval step exists.

## Implementation checklist

- Parse and validate quoted CSV rows.
- Persist import batches and resumable row outcomes.
- Link exact Global matches; create approved Private Words for all other rows.
- Keep FSRS state as the source of `Mới`, `Đang học`, `Review`, and `Học lại`.
- Verify learner import, resume, duplicate, and conflict flows with tests.

Legacy moderation tables and migrations remain in Supabase only so existing environments can replay their migration history.
