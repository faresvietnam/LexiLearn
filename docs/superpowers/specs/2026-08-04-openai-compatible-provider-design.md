# OpenAI-Compatible AI Provider Design

## Goal

Keep Gemini available and add an OpenAI-compatible provider for AI-assisted
vocabulary entry. Each signed-in user can choose the active provider and sync
their OpenAI-compatible base URL, token, and model through Supabase.

This feature intentionally keeps the current browser-direct architecture. The
browser reads the signed-in user's credential and sends it directly to the
selected AI provider.

## Scope

The provider selection applies to:

- `AI Auto-Fill` for one word.
- `AI thêm danh sách` for batch AI entry.

Manual vocabulary entry and all non-AI learning behavior remain unchanged.

The supported providers are:

- `gemini`
- `openai-compatible`

Existing users default to `gemini`, preserving current behavior without
requiring a settings update.

## Settings and Persistence

Add these fields to `public.user_settings`:

- `ai_provider`, constrained to `gemini` or `openai-compatible`, defaulting to
  `gemini`.
- `openai_compatible_base_url`.
- `openai_compatible_token`.
- `openai_compatible_model`.

The existing `gemini_api_key` remains unchanged.

The existing owner-only `user_settings` boundary is reasserted in the
migration:

- RLS remains enabled.
- Anonymous access remains revoked.
- Authenticated users may select and update only the row whose `user_id`
  equals `auth.uid()`.
- Admin-oriented application queries do not receive AI credentials.

The OpenAI-compatible base URL, token, model, and selected provider are loaded
with the user's settings after authentication. Saving this provider
configuration updates all four values together so the UI does not expose a
partially updated configuration.

The OpenAI-compatible token is stored as plaintext, like the existing Gemini
key, because the selected architecture requires the browser to read it.
Neither credential is written to application logs, rendered in error
messages, or included in exported learning data.

## Settings Interface

The AI settings card contains a provider selector with `Gemini` and
`OpenAI-compatible`.

When `Gemini` is selected, the existing Gemini key instructions and controls
remain available.

When `OpenAI-compatible` is selected, the card shows:

- Base URL, with an example such as `https://integrate.8686.vn/v1`.
- Token, rendered as a password input with autocomplete disabled.
- Model, with an example such as `deepseek-ai/deepseek-v4-flash`.
- A save action for the complete OpenAI-compatible configuration.
- A separate token removal action.

Saving requires non-empty, valid values for base URL, token, and model. A
saved token may be retained while the user changes only the base URL or model.
Removing the token clears only the token and leaves the non-secret connection
details available for later reuse.

The base URL is trimmed and trailing slashes are removed before persistence.
It must:

- Be a valid absolute URL.
- Use `https:`.
- Have no username, password, query string, or fragment.

The client appends `/chat/completions` to the normalized base URL. Therefore,
`https://integrate.8686.vn/v1` becomes
`https://integrate.8686.vn/v1/chat/completions`.

## Provider-Neutral AI Boundary

The vocabulary form calls one provider-neutral operation with:

- The selected provider.
- The provider configuration.
- The English word to analyze.

This operation routes to the existing Gemini transport or the new
OpenAI-compatible transport. Both transports return the same internal word
analysis type, so form filling, canonical-word handling, morphology
validation, meanings, word families, and example handling do not depend on
the selected provider.

Shared prompt construction, response parsing, validation, and normalization
are extracted from the current Gemini-specific client. Transport-specific
request and response envelopes remain isolated in their respective clients.

## OpenAI-Compatible Request

The browser sends:

```text
POST {normalizedBaseUrl}/chat/completions
Authorization: Bearer {token}
Content-Type: application/json
```

The request body contains:

- The configured `model`.
- System and user messages containing the shared vocabulary-analysis
  instructions.
- `response_format: {"type": "json_object"}`.

The first implementation omits optional sampling parameters such as
`temperature` to avoid incompatibilities between otherwise OpenAI-compatible
models.

The first implementation targets endpoints compatible with this Chat
Completions contract. The verified configuration
`https://integrate.8686.vn/v1` with
`deepseek-ai/deepseek-v4-flash` supports `response_format` and is a concrete
acceptance case.

The response content is read from
`choices[0].message.content`, parsed as JSON, and passed through the shared
word-analysis validator. Markdown code fences are not accepted as a substitute
for valid JSON.

## Gemini Request

Gemini keeps its existing endpoint, authentication header, structured response
schema, and error behavior. Refactoring into the provider-neutral boundary
must not change the generated Gemini request or its validated result.

## Error Handling

The AI action does not overwrite the current manual form when a request fails.

User-facing errors distinguish:

- Missing provider configuration.
- Invalid base URL.
- Authentication failure.
- Quota or rate-limit failure.
- Temporarily unavailable provider or model.
- Browser network or CORS failure.
- Invalid HTTP response envelope.
- Invalid word-analysis JSON.

Error messages identify the selected provider but never contain a token,
authorization header, or full request dump.

For OpenAI-compatible endpoints:

- `401` and `403` are credential or permission failures.
- `429` is a quota or rate-limit failure.
- `408`, `425`, `500`, `502`, `503`, and `504` are temporary failures.
- Other non-success statuses produce a generic provider HTTP error.

Batch entry preserves its current sequential behavior: it reports the affected
word, continues with remaining words where the current workflow permits, and
never falls back silently to a different provider.

If the remote server does not permit browser CORS requests or does not support
`response_format`, the app reports that incompatibility. It does not retry
without structured JSON because doing so would weaken the response contract
and could duplicate a billable request.

## Security Boundaries

RLS prevents one authenticated user from reading another user's settings, but
it does not make a credential secret from its owner, the running browser,
database operators, backups, or code executing in the application's origin.

The UI explains that browser-direct credentials may be exposed by a
compromised account, malicious browser extension, cross-site scripting, or
database administrative access. Users should use restricted, revocable
provider tokens with spending or quota limits where the provider supports
them.

No service-role Supabase credential is introduced into the frontend.

## Testing

Database and repository tests verify:

- Existing rows default to the Gemini provider.
- The new configuration maps between database rows and `UserSettings`.
- Provider configuration saves atomically for the owning user.
- Owner-only RLS continues to protect the credential columns.
- Credential fields do not appear in administrative queries or learning-data
  exports.

Settings component tests verify:

- Provider-specific fields switch correctly.
- Existing Gemini settings remain functional.
- Base URL, token, and model are normalized and saved.
- Invalid or non-HTTPS base URLs are rejected.
- An existing token can be retained while base URL or model changes.
- Token removal does not clear base URL or model.

AI client tests verify:

- Gemini requests remain unchanged.
- The provider-neutral operation routes to the selected transport.
- The OpenAI-compatible URL is constructed exactly once without duplicate
  slashes.
- The configured model and `response_format` are sent.
- The token appears only in the Bearer authorization header.
- A valid `choices[0].message.content` result fills the shared analysis type.
- Missing content, invalid JSON, and invalid analysis structures are rejected.
- Authentication, quota, temporary, network, and CORS-like failures produce
  safe provider-specific messages.
- Error output and logging never expose either provider token.

Component regression tests verify both single and batch AI entry using the
selected OpenAI-compatible provider while preserving manual-entry data after
failures.
