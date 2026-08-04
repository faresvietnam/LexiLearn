# OpenAI-Compatible Backend Proxy Design

## Goal

Move every OpenAI-compatible AI request from the browser to a dedicated
Vercel/Express backend function. After a token is saved, the browser must not
be able to read it back from Supabase or from any application response.

Gemini keeps its current browser-direct integration.

The existing Base URL and Model placeholder examples remain unchanged.

## Architecture

Add a dedicated `POST /api/ai/analyze` endpoint implemented as a Vercel
Function and forwarded by the existing Express development server.

The frontend sends only:

- The signed-in user's Supabase access token in the Authorization header.
- The English word to analyze in a JSON body.

The backend:

1. Verifies the Supabase access token.
2. Reads the authenticated user's selected provider, base URL, stored
   plaintext provider token, and model from `user_settings` over the encrypted
   Supabase connection.
3. Rejects the request unless the selected provider is
   `openai-compatible`.
4. Validates the provider URL against the server-side SSRF policy.
5. Builds the vocabulary prompt and Chat Completions request itself.
6. Calls the configured provider with the stored Bearer token.
7. Parses and validates the provider response.
8. Returns only the normalized word-analysis result.

The endpoint is specialized for vocabulary analysis. It is not a transparent
or general-purpose HTTP proxy.

## Credential Persistence and Visibility

`openai_compatible_token` remains in `public.user_settings` and remains
protected by the existing owner-only RLS policies.

Add a generated boolean column:

```text
openai_compatible_token_configured
```

It is true when a non-empty compatible token is stored and false otherwise.
The browser reads this boolean but never selects
`openai_compatible_token`.

The settings domain replaces the browser-visible token value with:

```text
openAICompatibleTokenConfigured: boolean
```

The token input is always blank after settings hydration. The UI displays
`Đã lưu token` when the generated flag is true.

Saving behaves as follows:

- A non-empty token replaces the stored token.
- An empty token preserves the stored token while base URL or model changes.
- The separate remove action explicitly sets the token to null.
- Save responses return the generated configured flag and non-secret provider
  settings, never the token.

The token necessarily exists in the browser while the user initially types
and saves it. It is not persisted in browser state after a successful save and
is never loaded back during later sessions.

## Supabase Access from the Backend

The backend uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; no service-role
key is introduced.

It verifies the bearer access token with Supabase Auth. It then queries
`user_settings` using the same user JWT so Postgres RLS remains the
authorization boundary. The query also scopes by the verified user ID.

The backend selects only:

- `ai_provider`
- `openai_compatible_base_url`
- `openai_compatible_token`
- `openai_compatible_model`

No token value is included in application logs, exceptions, or HTTP response
bodies.

## Provider Request

After URL validation, the backend calls:

```text
POST {normalizedBaseUrl}/chat/completions
Authorization: Bearer {storedToken}
Content-Type: application/json
```

The request body contains:

- The stored model.
- The shared vocabulary-analysis system and user messages.
- `response_format: {"type":"json_object"}`.

Optional sampling parameters such as `temperature` remain omitted.

The backend reads `choices[0].message.content`, requires valid JSON, and passes
it through the existing shared word-analysis validator. It returns the
normalized analysis object rather than the raw provider response.

## Server-Side URL and SSRF Policy

OpenAI-compatible base URLs must:

- Be valid absolute URLs using `https:`.
- Use the default HTTPS port or no explicit port.
- Contain no username, password, query, or fragment.
- Not use `localhost` or a hostname ending in `.localhost`, `.local`, or
  `.internal`.
- Not be an IP literal in a loopback, private, link-local, multicast,
  unspecified, carrier-grade NAT, or documentation range.
- Resolve only to public IPv4 or IPv6 addresses.

Before the provider request, the backend resolves all hostname addresses and
rejects the URL if any result is non-public. Provider fetches use
`redirect: "manual"`; every redirect response is rejected instead of
followed.

This policy reduces server-side request forgery risk for user-configured
provider URLs. DNS validation and the outbound fetch remain isolated in a
focused server utility so stronger network controls can replace the
implementation later without changing the API handler.

## Frontend Data Flow

For Gemini:

```text
AddWordModal -> Gemini API
```

For OpenAI-compatible:

```text
AddWordModal
  -> obtain current Supabase session access token
  -> POST /api/ai/analyze
  -> backend reads provider config through user RLS
  -> backend calls provider
  -> normalized analysis returns to AddWordModal
```

Single and batch Auto-Fill use the same frontend proxy client. Batch requests
remain sequential and each word creates one authenticated proxy request.

## Vercel and Local Express Integration

Create the Vercel handler under `api/ai/analyze.ts` using the same Web
`Request`/`Response` pattern as `api/images/presign.ts`.

`server.ts` forwards `POST /api/ai/analyze` to that handler during local
development and passes through:

- Authorization.
- Content-Type.
- The JSON request body.

No new server secret is required because the project already uses
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for authenticated server
functions.

## Error Handling

The proxy returns bounded, credential-safe JSON errors:

- `400` for invalid body, invalid provider configuration, or unsafe URL.
- `401` for a missing or invalid Supabase access token.
- `409` when the active provider is not OpenAI-compatible.
- `422` for invalid provider JSON or an invalid analysis shape.
- `429` when the provider reports a rate or quota limit.
- `502` for provider authentication, permission, or other provider HTTP
  failures.
- `503` for missing server configuration, network failures, DNS failures, or
  temporary provider failures.

Frontend error messages preserve the user's manual form values. They no longer
describe browser CORS because the browser no longer contacts the provider.

The backend does not return provider response bodies because they may contain
credential-adjacent diagnostics or untrusted content.

## Migration and Backward Compatibility

The migration adds only the generated configured flag. Existing tokens, base
URLs, models, and provider choices remain unchanged.

Existing users with a stored compatible token immediately receive
`openai_compatible_token_configured = true`.

Gemini settings and behavior are unaffected.

The old browser-direct compatible client is removed after the proxy client is
covered by tests. No fallback to browser-direct provider calls remains.

## Testing

Database and repository tests verify:

- The generated configured flag reflects null, empty, and non-empty tokens.
- Learner hydration never selects the token column.
- Settings save and remove operations return no token.
- An empty token preserves the existing stored credential.
- Explicit removal clears it.

Backend unit tests verify:

- Missing, malformed, expired, and invalid JWTs are rejected.
- The verified user's RLS-scoped configuration is used.
- A non-compatible active provider is rejected.
- Request bodies cannot override stored base URL, token, or model.
- The stored token appears only in the outbound Authorization header.
- Provider response bodies and credentials never appear in errors.
- Every SSRF rule rejects the expected URL or resolved address.
- Redirects are not followed.
- Valid Chat Completions content becomes a normalized analysis.
- Provider authentication, quota, temporary, malformed, and network failures
  map to the documented statuses.

Frontend tests verify:

- Hydrated settings expose only the configured boolean.
- Settings show `Đã lưu token` without populating the password input.
- Saving a new token clears the local password field after success.
- Saving URL/model with a blank input preserves the token.
- Removing the token updates the configured state.
- Compatible single and batch Auto-Fill call only `/api/ai/analyze`.
- Proxy requests contain the Supabase access token but no provider token,
  base URL, or model.
- Gemini continues calling its current endpoint directly.

Integration and build verification cover the Express forwarder, Vercel
function bundle, full test suite, TypeScript, and production build.
