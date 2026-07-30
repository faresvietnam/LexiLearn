# Task 5 Report: Personal Gemini Browser Auto-Fill

## Outcome

- Added nullable `user_settings.gemini_api_key` through a forward migration.
- Reasserted `authenticated` owner-only SELECT/UPDATE RLS and revoked `anon`
  table access. Admin status does not grant access to another user's settings.
- Hydrated the personal key with learner settings and added isolated
  owner-filtered load/save/remove repository operations.
- Added password-style Settings controls with explicit save/remove actions.
- Replaced `/api/ai/analyze-word` with a direct browser request to Gemini
  `gemini-2.5-flash` using the user's key in the `x-goog-api-key` header.
- Removed the server-side Gemini route and the `@google/genai` dependency. No
  Gemini service key, Supabase secret key, or `service_role` key is used.
- Added missing-key, 429 quota, invalid-key, temporary HTTP, network, and
  malformed-output feedback. Every failure leaves manual word entry available.
- Kept Gemini key data out of the Admin user-directory query and all logging.

## Security Trade-off

Supabase projects are encrypted at rest by default, and RLS limits this row to
its owner. That protects stored data from other application users, but it does
not turn a browser-readable key into a server-side secret. Direct Auto-Fill
requires the browser to hold the plaintext key and send it in a request header,
so the user can inspect it in browser memory/devtools and same-origin script
compromise could read it. The Settings UI and README state this limitation and
provide an explicit remove action.

References:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/extensions/pgsodium
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/api/generate-content

## TDD Evidence

The first focused run failed for the intended missing behaviors: repository
functions did not exist, Settings had no key controls, Add Word still called
the local proxy and logged its error, and the direct Gemini client was absent.
After minimal implementation, the focused run passed 15/15 tests.

Coverage includes request construction without key-in-URL/body/logs, structured
response validation, quota/error mapping, owner-filtered persistence,
save/remove behavior, browser-exposure copy, missing-key fallback, direct form
fill, and manual entry after failure. A transactional SQL test covers owner,
different-user, Admin, and `anon` behavior.

## Verification

- `npm test -- --run` — passed (123/123).
- `npm run lint` — passed.
- `npm run build` — passed; Vite reports the existing large-chunk advisory.
- `git diff --check` — passed.
- Supabase security advisors — no table/RLS findings; one existing project-level
  warning that leaked-password protection is disabled.
- Supabase performance advisors — existing foreign-key/index and multiple
  permissive-policy notices; this migration adds no foreign key, index, or
  additional policy.

## Database Handoff

The local Supabase stack could not run because Docker was unavailable, so
`supabase db reset` and `supabase/tests/phase_3_gemini_key_rls.sql` were not
executed. The live `web-eng` project was inspected read-only and was not
mutated. Apply `20260730075754_add_personal_gemini_key.sql` through the normal
migration workflow, then run the SQL RLS test and both advisors again against
the migrated database.
