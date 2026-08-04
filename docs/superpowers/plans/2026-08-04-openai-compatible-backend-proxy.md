# OpenAI-Compatible Backend Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every OpenAI-compatible vocabulary analysis through an authenticated backend while preventing saved provider tokens from being loaded back into the browser.

**Architecture:** Add a generated token-status column, remove token values from frontend hydration, and implement a specialized Vercel function that verifies a Supabase JWT, reads the owner-scoped provider configuration through RLS, validates the destination, and performs the Chat Completions request. The browser calls only the app endpoint; Gemini remains browser-direct.

**Tech Stack:** React 19, TypeScript 5.8, Express, Vercel Functions, Supabase Auth/Postgres RLS, Vitest, Node DNS/fetch.

## Global Constraints

- OpenAI-compatible tokens must never be returned by settings hydration, save responses, proxy responses, or errors.
- The backend uses only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; no service-role key.
- OpenAI-compatible requests call only `POST /api/ai/analyze`.
- Gemini retains its current browser-direct request.
- The proxy accepts only a word; stored URL, token, and model cannot be overridden by the request.
- The proxy allows only public HTTPS destinations on the default port and never follows redirects.
- Existing Base URL and Model placeholder examples remain unchanged.
- Batch analysis remains sequential.

---

### Task 1: Expose Token Status Without Exposing the Token

**Files:**
- Create: `supabase/migrations/20260804080000_add_openai_token_configured_flag.sql`
- Modify: `supabase/tests/phase_2_migration_chain.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/data/mockData.ts`
- Modify: `src/features/persistence/mappers.ts`
- Modify: `src/features/persistence/persistence.test.ts`
- Modify: `src/features/persistence/settingsRepository.ts`
- Modify: `src/features/persistence/settingsRepository.test.ts`
- Modify: `src/features/persistence/vocabularyRepository.ts`

**Interfaces:**
- Replace `UserSettings.openAICompatibleToken` with
  `UserSettings.openAICompatibleTokenConfigured: boolean`.
- Change `AiProviderSettings` to include:

```ts
type AiProviderSettings = {
  aiProvider: AiProvider;
  geminiApiKey: string | null;
  openAICompatibleBaseUrl: string;
  openAICompatibleTokenConfigured: boolean;
  openAICompatibleModel: string;
};
```

- Add a save input that can distinguish preserve, replace, and remove:

```ts
type SaveAiProviderSettingsInput = AiProviderSettings & {
  openAICompatibleToken?: string | null;
};
```

- [ ] **Step 1: Write failing secrecy and mapping tests**

Assert learner hydration selects
`openai_compatible_token_configured` and does not contain
`openai_compatible_token,` in its settings column list. Assert mapping:

```ts
expect(mapSettingsRow({
  // existing row fields
  openai_compatible_token_configured: true,
})).toMatchObject({
  openAICompatibleTokenConfigured: true,
});
```

Repository tests must prove:

```ts
await saveAiProviderSettings('owner', {
  ...settings,
  openAICompatibleTokenConfigured: true,
  // property omitted: preserve the stored token
});

expect(update).toHaveBeenCalledWith(expect.not.objectContaining({
  openai_compatible_token: expect.anything(),
}));
expect(selectAfterUpdate).not.toHaveBeenCalledWith(
  expect.stringContaining('openai_compatible_token,'),
);
```

Add explicit replace and null-removal cases.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/features/persistence/persistence.test.ts src/features/persistence/settingsRepository.test.ts --run
```

Expected: FAIL because the domain still exposes the token and the generated
flag does not exist.

- [ ] **Step 3: Add the generated database flag**

Create the migration with the Supabase CLI migration generator, then use:

```sql
alter table public.user_settings
add column openai_compatible_token_configured boolean
generated always as (
  nullif(btrim(openai_compatible_token), '') is not null
) stored;
```

Update the migration-chain expectation with the exact generated filename.

- [ ] **Step 4: Update domain mapping and hydration**

Remove `openAICompatibleToken` from `UserSettings` and `SettingsRow`. Add the
configured boolean. In the learner-state query, select:

```text
openai_compatible_base_url,
openai_compatible_token_configured,
openai_compatible_model
```

Do not select `openai_compatible_token`.

- [ ] **Step 5: Make save responses credential-safe**

Build the update payload conditionally:

```ts
const updatePayload = {
  ai_provider: input.aiProvider,
  gemini_api_key: input.geminiApiKey?.trim() || null,
  openai_compatible_base_url: normalizedBaseUrl || null,
  openai_compatible_model: normalizedModel || null,
  ...('openAICompatibleToken' in input
    ? {openai_compatible_token: input.openAICompatibleToken?.trim() || null}
    : {}),
};
```

Select and return only the non-secret fields and generated boolean.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/features/persistence/persistence.test.ts src/features/persistence/settingsRepository.test.ts supabase/tests/phase_2_migration_chain.test.ts --run
npm run lint
```

Commit:

```bash
git add supabase/migrations supabase/tests src/types/index.ts src/data/mockData.ts src/features/persistence
git commit -m "security: stop hydrating compatible AI tokens"
```

---

### Task 2: Implement the Specialized Backend Proxy

**Files:**
- Create: `api/ai/analyze.ts`
- Create: `src/features/openai/providerUrlPolicy.ts`
- Create: `src/features/openai/providerUrlPolicy.test.ts`
- Create: `src/features/openai/analyzeFunction.test.ts`

**Interfaces:**
- Produce:

```ts
export type AnalyzeFunctionDependencies = {
  verifyAccessToken(token: string): Promise<string | null>;
  loadProviderSettings(
    token: string,
    userId: string,
  ): Promise<{
    provider: AiProvider;
    baseUrl: string;
    providerToken: string;
    model: string;
  } | null>;
  resolveHostname(hostname: string): Promise<string[]>;
  fetchProvider: typeof fetch;
};

export function createAnalyzeHandler(
  dependencies: AnalyzeFunctionDependencies,
): (request: Request) => Promise<Response>;
```

- Produce:

```ts
export function validateProviderBaseUrl(
  value: string,
  resolvedAddresses: string[],
): string;
```

- [ ] **Step 1: Write failing URL-policy tests**

Test a valid public URL and reject literals/hostnames covering:

```ts
[
  'http://example.com/v1',
  'https://localhost/v1',
  'https://service.local/v1',
  'https://127.0.0.1/v1',
  'https://10.0.0.1/v1',
  'https://169.254.169.254/latest',
  'https://[::1]/v1',
  'https://example.com:8443/v1',
  'https://user:pass@example.com/v1',
  'https://example.com/v1?x=1',
]
```

Also reject a public hostname when any resolved address is private.

- [ ] **Step 2: Run URL tests and verify RED**

Run:

```bash
npm test -- src/features/openai/providerUrlPolicy.test.ts --run
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the URL policy**

Use `node:net` `isIP`, explicit IPv4/IPv6 range checks, and normalized URL
parsing. Return a base URL without trailing slash only when every resolved
address is public.

- [ ] **Step 4: Write failing handler tests**

Tests exercise the real handler with dependency fakes:

```ts
const request = new Request('https://app.example/api/ai/analyze', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer user-jwt',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({word: 'running'}),
});
```

Cover missing/invalid JWT, invalid JSON, extra provider override fields,
non-compatible provider, missing config, unsafe URL, provider authorization,
quota, redirect, temporary/network errors, invalid response, and a valid
normalized result. Assert the provider token appears only in the outbound
Authorization header.

- [ ] **Step 5: Run handler tests and verify RED**

Run:

```bash
npm test -- src/features/openai/analyzeFunction.test.ts --run
```

Expected: FAIL because `api/ai/analyze.ts` does not exist.

- [ ] **Step 6: Implement the handler and runtime dependencies**

Runtime dependencies:

- Verify JWT with `supabase.auth.getUser(token)`.
- Create an RLS-scoped client with the publishable key and
  `global.headers.Authorization = Bearer ${token}`.
- Select the owner row by verified user ID.
- Resolve DNS using `node:dns/promises.lookup(hostname, {all: true})`.
- Call the provider with `redirect: 'manual'`.

Use the shared prompt and parser. Return only normalized analysis JSON.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test -- src/features/openai/providerUrlPolicy.test.ts src/features/openai/analyzeFunction.test.ts --run
npm run lint
```

Commit:

```bash
git add api/ai/analyze.ts src/features/openai/providerUrlPolicy.ts src/features/openai/providerUrlPolicy.test.ts src/features/openai/analyzeFunction.test.ts
git commit -m "feat: proxy compatible AI analysis through backend"
```

---

### Task 3: Switch the Frontend to the Authenticated Proxy

**Files:**
- Modify: `src/features/openai/openAICompatibleClient.ts`
- Modify: `src/features/openai/openAICompatibleClient.test.ts`
- Modify: `src/features/ai/aiClient.ts`
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/components/SettingsView.test.tsx`
- Modify: `src/components/AddWordModal.tsx`
- Modify: `src/components/AddWordModal.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Replace the browser provider configuration input with:

```ts
export function analyzeWordWithOpenAICompatible(input: {
  word: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis>;
```

- `analyzeWordWithAI` accepts `getAccessToken: () => Promise<string | null>`.

- [ ] **Step 1: Write failing proxy-client tests**

Assert:

```ts
expect(fetchImpl).toHaveBeenCalledWith('/api/ai/analyze', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer supabase-access-token',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({word: 'running'}),
});
```

Assert the request contains no provider token, base URL, or model. Cover safe
mapping of proxy statuses and valid normalized analysis JSON.

- [ ] **Step 2: Run client tests and verify RED**

Run:

```bash
npm test -- src/features/openai/openAICompatibleClient.test.ts src/features/ai/aiClient.test.ts --run
```

Expected: FAIL because the client still calls the provider directly.

- [ ] **Step 3: Implement proxy-only compatible client**

Remove direct provider URL/token/model handling and call only the app endpoint.
Delete the browser URL normalizer after Settings no longer imports it.

- [ ] **Step 4: Write failing settings secrecy tests**

Assert:

- The token input starts blank when `openAICompatibleTokenConfigured` is true.
- `Đã lưu token` is visible.
- Blank token save omits `openAICompatibleToken`.
- New-token save includes it once and clears the input after success.
- Remove sends `openAICompatibleToken: null`.

- [ ] **Step 5: Implement Settings and App changes**

Keep a blank local token input. Use the configured boolean for status and
remove-button state. Merge credential-safe save responses into App settings.

- [ ] **Step 6: Route AddWordModal with the Supabase access token**

Obtain the current session from `getSupabaseClient().auth.getSession()` only
when the compatible provider is selected. Pass the access token to the proxy
client. Keep the Gemini branch unchanged.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test -- src/features/openai/openAICompatibleClient.test.ts src/features/ai/aiClient.test.ts src/components/SettingsView.test.tsx src/components/AddWordModal.test.tsx src/App.test.tsx --run
npm run lint
```

Commit:

```bash
git add src/features/openai src/features/ai src/components/SettingsView.tsx src/components/SettingsView.test.tsx src/components/AddWordModal.tsx src/components/AddWordModal.test.tsx src/App.tsx
git commit -m "feat: use authenticated AI proxy from browser"
```

---

### Task 4: Add Local Forwarding, Documentation, and Production Verification

**Files:**
- Modify: `server.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Test: existing full suite and production build.

**Interfaces:**
- Local Express forwards `POST /api/ai/analyze` to the Vercel-style handler.

- [ ] **Step 1: Add the Express forwarder**

Import the AI function and forward method, authorization, content type, and
JSON body using the same pattern as image presigning.

- [ ] **Step 2: Update documentation**

Document that:

- Compatible calls are backend-proxied.
- Saved tokens are not loaded back to the browser.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required server variables.
- User-configured destinations are restricted to public HTTPS endpoints.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, TypeScript is clean, and both Vite and the Express
bundle build successfully.

- [ ] **Step 4: Apply and verify the migration**

Apply the committed migration to the connected Supabase project. Query
`information_schema.columns` to verify the generated flag and run security
advisors.

- [ ] **Step 5: Commit, push, and verify deployment inputs**

Commit:

```bash
git add server.ts README.md .env.example
git commit -m "docs: document compatible AI backend proxy"
git push origin main
```

Confirm the production hosting environment already contains
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Do not print their values.
