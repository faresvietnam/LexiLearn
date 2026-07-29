# LexiLearn — Phase 2: Persistence and Authentication Design

## Goal

Replace Phase 1's local-only identity and durable learner state with Supabase Auth, PostgreSQL, and RLS while preserving the existing React/Vite navigation and learning sequence.

## Delivery approach

Phase 2 is delivered as vertical slices, each committed independently:

1. Establish the Supabase client, environment contract, migrations, database functions, and RLS.
2. Add Google OAuth, authenticated session handling, learner/admin authorization, and the protected `/admin` route.
3. Persist profile settings, Study Scope, Decks, Tags, personal vocabulary membership and word-study status.
4. Persist session lifecycle and attempts without replacing Phase 1's rule-based SRS or adding FSRS scheduling.

The existing Phase 1 changes are committed as the baseline before Phase 2 implementation work begins.

## Authentication and authorization

- Supabase Auth is the sole source of authenticated identity.
- The React app uses `@supabase/supabase-js` with only `VITE_SUPABASE_URL` and the publishable/anon key. It must never contain the service-role key.
- The user signs in through `signInWithOAuth({ provider: 'google' })`, with a redirect URL calculated from the active Vite/Vercel origin.
- A database trigger creates `public.users` on the first `auth.users` row, using Google metadata for display name/avatar when present.
- The trigger grants every new user `learner`. It grants both `learner` and `admin` when `auth.users.email = 'thanghong195@gmail.com'` (case-insensitive).
- The client reads roles from `user_roles` but never treats UI state as authorization. RLS and database helper functions enforce access.
- `/admin` is a client route protected by the authenticated admin role. Non-admin users are redirected to the dashboard.

## OAuth configuration checkpoint

Implementation pauses before Google sign-in is enabled in Supabase. The user creates a Google OAuth Web Client and configures the returned Client ID and Client Secret directly in the Supabase Auth Google provider screen.

Google Cloud configuration requires:

- Authorized JavaScript origins: `http://localhost:3000` and the chosen Vercel deployment origin.
- Authorized redirect URI: `https://whsyzhsvsmyzdaxqrvoi.supabase.co/auth/v1/callback`.

Supabase URL Configuration requires `http://localhost:3000` and the Vercel deployment origin in allowed Redirect URLs, with the production URL used as Site URL when known. The app calls `signInWithOAuth` with `redirectTo` set to the current origin.

## Database model

The migration creates tables in `public` with RLS enabled before client access is granted:

- Identity/configuration: `users`, `user_roles`, `user_settings`, `app_settings`, `ai_auto_fill_usage`.
- Shared content: `global_words`, `global_meanings`, `global_examples`, `word_parts`.
- Learner-owned content/state: `private_words`, `private_meanings`, `personal_vocabulary`, `personal_word_tags`, `decks`, `tags`, `study_scope`, `learning_cards`.
- Durable learning events: `study_sessions`, `study_attempts`.

Personal rows use `user_id = auth.uid()` ownership. Shared Global content is readable to signed-in users, while modifications require `is_admin()`. Personal metadata is separate from Global content so personal Deck, Tag, status, and learning state remain editable without allowing Global edits.

The schema uses UUID primary keys, `timestamptz` timestamps, check constraints for enum-like values, unique normalized word keys as appropriate, and indexes that match RLS/user session queries.

## User defaults and study day

The profile trigger creates:

- `timezone = 'Asia/Ho_Chi_Minh'`
- `study_day_starts_at = '04:00'`
- default `user_settings` equivalent to Phase 1 settings
- app setting `gemini_auto_fill_daily_limit = 10` through a seed migration

An SQL helper calculates each user's study date using their IANA timezone and the 04:00 local boundary. Phase 2 records the boundary-compatible date where required but leaves FSRS/review due computation to Phase 3.

## Frontend persistence boundary

Add focused repositories/hooks around Supabase rather than embedding queries in visual components. `App` remains responsible for navigation and session orchestration; data adapters hydrate its existing shapes from persisted rows. The Phase 1 mock data remains only as a local development fallback until the signed-in initial state is hydrated.

Persist in Phase 2:

- Settings, Study Scope, Decks, Tags, vocabulary membership and status changes.
- Session creation, pause/completion state, and attempts/retries/hints/response time/error types.

Do not implement Phase 3 flows in this phase: Gemini Vercel Function, durable queue building, FSRS, Admin moderation transactions, or CSV persistence.

## Error handling and testing

- Missing Supabase environment variables render a clear configuration screen in development instead of crashing.
- Auth loading, sign-in failure, sign-out, unauthorized admin route, and persistence failures surface recoverable messages.
- SQL migration tests validate role bootstrap and RLS access with learner/admin identities.
- Unit tests cover row-to-domain mappers and study-day boundary helpers.
- React tests cover auth gate, protected admin redirect, and persistence callbacks.

## Security constraints

- RLS is enabled on every public application table before grants/data access.
- No service-role key is bundled in the browser or committed to the repository.
- Admin policy checks call a `security definer` `is_admin()` function that reads `user_roles` safely.
- OAuth secrets are entered only into Google Cloud/Supabase/Vercel configuration, never source code or chat.
