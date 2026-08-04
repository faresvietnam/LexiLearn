# Add Word API Endpoint Design

## Goal

Let a user add a private word to their own vocabulary from outside the web
app (curl, iOS Shortcuts, n8n, etc.) by calling a new authenticated HTTP
endpoint, without building a separate long-lived token system.

## Authentication

The endpoint reuses the user's existing Supabase session access token — the
same credential `api/ai/analyze.ts` and `api/images/presign.ts` already
accept as a Bearer token. No new token table, RPC, or expiry handling is
introduced.

A Supabase access token is a signed JWT issued at login and carries the
user's id (`sub` claim). The backend never trusts a client-supplied user id;
it always calls Supabase Auth to resolve the token to a user id, and the
database's own row-level checks (see below) reject any mismatch.

This token expires after Supabase's default session lifetime (~1 hour). For
scripted/repeated use, the user re-copies a fresh token from Settings when it
expires. This limitation is accepted; no refresh-token flow or long-lived
personal access token is built.

## Settings: expose the current access token

Add an "API access" card to `SettingsView`:

- On mount, read the current session via
  `getSupabaseClient()?.auth.getSession()`.
- Show the `access_token` value in a read-only field with a copy button.
- Show a short note that the token expires after about an hour and a fresh
  one can be copied after signing back in.

This is self-contained: it reads the client directly (same pattern already
used elsewhere in the codebase) and needs no new props, no changes to
`AuthProvider`, and no backend support.

## API Endpoint

`POST /api/words/add`, implemented as a Vercel Function using the same Web
`Request`/`Response` handler-factory pattern as `api/ai/analyze.ts` and
`api/images/presign.ts` (a `create*Handler(dependencies)` factory for unit
testing, plus a thin `runtimeDependencies()` + default export for
production).

### Request

```text
POST /api/words/add
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

Body — the same shape the app already sends to the `create_private_word` RPC
via `vocabularyRepository.createPrivateWord`:

```jsonc
{
  "word": "run",                 // required, non-empty
  "ipa": "/rʌn/",                // optional
  "audio_url": "https://...",    // optional
  "image_url": "https://...",    // optional
  "deck_id": "uuid",             // optional, must belong to the user
  "tag_ids": ["uuid"],           // optional, each must belong to the user
  "study_status": "active",      // optional, defaults to "active"
  "meanings": [                  // required, at least 1
    {
      "meaning_vi": "chạy",
      "part_of_speech": "verb",
      "definition_en": "to move quickly on foot", // optional
      "examples": [                                // optional
        {"sentence": "I run every morning."}
      ]
    }
  ],
  "parts": []                    // optional, word-structure components
}
```

The endpoint does not re-implement field-level validation beyond checking
that `word` is a non-empty string and `meanings` is a non-empty array — the
`create_private_word` RPC already validates the rest (meaning/example shape,
deck ownership, tag ownership, word-part types) and is the single source of
truth for those rules.

### Handling

1. Read the Bearer token; return `401` if missing.
2. Verify it with `supabase.auth.getUser(token)`; return `401` if invalid.
3. Parse the JSON body; return `400` if it doesn't parse or fails the
   minimal `word`/`meanings` presence check.
4. Build the RPC payload: spread the body, set
   `owner_user_id = <verified user id>` and
   `normalized_word = word.trim().toLowerCase()`.
5. Create a Supabase client using the publishable key with the verified
   access token attached as the `Authorization` header (not the secret key),
   so `create_private_word`'s `auth.uid()` resolves to the real user — the
   RPC is `security invoker` and depends on this.
6. Call `.rpc('create_private_word', {p_payload: payload})`.
7. On success, return `201` with the created word JSON (same shape the RPC
   already returns to the frontend).
8. On RPC failure, map the Postgres error code:
   - `22023` (invalid payload) → `400`
   - `42501` (owner mismatch, deck not owned, tag not owned, not
     authenticated) → `403`
   - anything else → `500`

No service-role key is used anywhere in this endpoint.

## Local Dev and Deployment

`server.ts` gets one more forwarder, following the existing
`forwardAnalyzeRequest`/`forwardImageRequest` pattern:

```text
app.post('/api/words/add', forwardAddWordRequest);
```

Vercel picks up `api/words/add.ts` automatically via file-based routing in
production; no `vercel.json` changes are needed (none exist for the other
two endpoints either).

## Testing

`src/features/words/addWordFunction.test.ts`, mirroring
`src/features/openai/analyzeFunction.test.ts`: a dependency-injected
`createAddWordHandler(dependencies)` is tested directly, with `verifyAccessToken`
and the RPC call mocked.

Cases:

- Missing/invalid Bearer token → `401`.
- Non-JSON body → `400`.
- Missing `word` or empty `meanings` → `400`.
- RPC returns error code `22023` → `400`.
- RPC returns error code `42501` → `403`.
- RPC succeeds → `201` with the returned word JSON, and the call payload
  includes the verified user id as `owner_user_id`.

No new database migration, table, or RPC is added, so no database-level
tests are needed beyond the existing `create_private_word` coverage.
