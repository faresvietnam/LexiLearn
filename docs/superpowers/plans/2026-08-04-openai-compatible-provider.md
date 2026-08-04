# OpenAI-Compatible AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Supabase-synced OpenAI-compatible provider that can power single and batch AI vocabulary entry alongside the existing Gemini provider.

**Architecture:** Keep browser-direct provider calls. Extend `UserSettings` and `user_settings`, move the provider-independent prompt/parser into `features/ai`, isolate Gemini and OpenAI-compatible HTTP envelopes in separate clients, and route the vocabulary form through one provider-neutral function.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Testing Library, Supabase/Postgres RLS, OpenAI-compatible Chat Completions API.

## Global Constraints

- Supported providers are exactly `gemini` and `openai-compatible`.
- Existing users default to `gemini`.
- OpenAI-compatible requests call `{normalizedBaseUrl}/chat/completions`.
- OpenAI-compatible requests send `response_format: {"type":"json_object"}` and omit optional sampling parameters.
- OpenAI-compatible base URLs must be absolute `https:` URLs without credentials, query strings, or fragments.
- Credentials remain browser-readable plaintext protected by owner-only RLS, matching the existing Gemini architecture.
- Credentials must never appear in logs, user-facing errors, admin queries, or learning-data exports.
- Do not silently retry without `response_format` and do not fall back to another provider.

---

## File Structure

- Create `src/features/ai/wordAnalysis.ts`: shared prompt, analysis types, JSON parsing, validation, and base AI error class.
- Create `src/features/ai/aiClient.ts`: provider-neutral routing and configuration checks.
- Create `src/features/openai/openAICompatibleClient.ts`: Chat Completions request/response transport.
- Create `src/features/openai/openAICompatibleClient.test.ts`: transport, URL, response, and safe-error tests.
- Modify `src/features/gemini/geminiClient.ts`: delegate shared analysis work without changing its HTTP request.
- Modify `src/features/gemini/geminiClient.test.ts`: lock the unchanged Gemini request and shared parser behavior.
- Modify `src/types/index.ts` and `src/data/mockData.ts`: define and initialize provider settings.
- Modify `src/features/persistence/mappers.ts`, `settingsRepository.ts`, and their tests: map and atomically save provider configuration.
- Create `supabase/migrations/20260804120000_add_openai_compatible_provider.sql`: add provider configuration columns and reassert owner-only RLS.
- Create `supabase/tests/openai_compatible_provider_rls.sql`: prove owner isolation and anonymous denial.
- Modify `src/components/SettingsView.tsx` and `SettingsView.test.tsx`: provider selection and configuration form.
- Modify `src/App.tsx` and `src/App.test.tsx`: persist provider configuration and pass it to consumers.
- Modify `src/components/AddWordModal.tsx` and `AddWordModal.test.tsx`: route single and batch analysis through the selected provider.

---

### Task 1: Extend the Settings Domain and Database Schema

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/data/mockData.ts`
- Modify: `src/features/persistence/mappers.ts`
- Modify: `src/features/persistence/persistence.test.ts`
- Create: `supabase/migrations/20260804120000_add_openai_compatible_provider.sql`
- Create: `supabase/tests/openai_compatible_provider_rls.sql`
- Modify: `supabase/tests/phase_2_migration_chain.test.ts`

**Interfaces:**
- Produces: `AiProvider = 'gemini' | 'openai-compatible'`.
- Produces: `UserSettings.aiProvider`, `openAICompatibleBaseUrl`, `openAICompatibleToken`, and `openAICompatibleModel`.
- Produces: matching `SettingsRow` snake-case columns.

- [ ] **Step 1: Write the failing mapper and default tests**

Add a mapper expectation in `src/features/persistence/persistence.test.ts`:

```ts
expect(mapSettingsRow({
  user_id: 'owner',
  new_words_per_day: 10,
  review_limit_per_day: 50,
  hint_behavior: 'manual',
  audio_autoplay: true,
  theme: 'light',
  language: 'vi',
  reduced_motion: false,
  char_diff_accessibility: true,
  gemini_api_key: 'gemini-key',
  ai_provider: 'openai-compatible',
  openai_compatible_base_url: 'https://integrate.8686.vn/v1',
  openai_compatible_token: 'compat-token',
  openai_compatible_model: 'deepseek-ai/deepseek-v4-flash',
})).toMatchObject({
  aiProvider: 'openai-compatible',
  openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
  openAICompatibleToken: 'compat-token',
  openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
});
```

Also assert `INITIAL_SETTINGS` contains:

```ts
expect(INITIAL_SETTINGS).toMatchObject({
  aiProvider: 'gemini',
  openAICompatibleBaseUrl: '',
  openAICompatibleToken: null,
  openAICompatibleModel: '',
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/features/persistence/persistence.test.ts
```

Expected: FAIL because the four new `UserSettings` fields and `SettingsRow` columns do not exist.

- [ ] **Step 3: Add the TypeScript domain fields**

In `src/types/index.ts`, add:

```ts
export type AiProvider = 'gemini' | 'openai-compatible';

export interface UserSettings {
  // existing fields remain
  aiProvider: AiProvider;
  geminiApiKey: string | null;
  openAICompatibleBaseUrl: string;
  openAICompatibleToken: string | null;
  openAICompatibleModel: string;
}
```

Initialize them in `INITIAL_SETTINGS` and add the snake-case fields to
`SettingsRow`. Map all four fields in `mapSettingsRow`.

- [ ] **Step 4: Add the migration and SQL policy test**

Create the migration with:

```sql
alter table public.user_settings
  add column ai_provider text not null default 'gemini'
    check (ai_provider in ('gemini', 'openai-compatible')),
  add column openai_compatible_base_url text,
  add column openai_compatible_token text,
  add column openai_compatible_model text;

alter table public.user_settings enable row level security;
revoke all on table public.user_settings from anon;
grant select, update on table public.user_settings to authenticated;

alter policy "settings read own" on public.user_settings
  to authenticated
  using ((select auth.uid()) = user_id);

alter policy "settings update own" on public.user_settings
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

In `supabase/tests/openai_compatible_provider_rls.sql`, use the existing SQL
test authentication helpers to prove:

```sql
-- Owner can read and update all four new columns.
-- A second authenticated user gets zero rows for the owner settings row.
-- The anon role cannot select or update user_settings.
-- ai_provider rejects values outside the two-value constraint.
```

Register the migration in the migration-chain test using the exact timestamped
filename.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npm test -- src/features/persistence/persistence.test.ts supabase/tests/phase_2_migration_chain.test.ts
npm run lint
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/data/mockData.ts src/features/persistence/mappers.ts src/features/persistence/persistence.test.ts supabase/migrations/20260804120000_add_openai_compatible_provider.sql supabase/tests/openai_compatible_provider_rls.sql supabase/tests/phase_2_migration_chain.test.ts
git commit -m "feat: add AI provider settings schema"
```

---

### Task 2: Persist Provider Configuration Atomically

**Files:**
- Modify: `src/features/persistence/settingsRepository.ts`
- Modify: `src/features/persistence/settingsRepository.test.ts`

**Interfaces:**
- Consumes: the four provider fields from `UserSettings`.
- Produces:

```ts
export type AiProviderSettings = Pick<
  UserSettings,
  | 'aiProvider'
  | 'geminiApiKey'
  | 'openAICompatibleBaseUrl'
  | 'openAICompatibleToken'
  | 'openAICompatibleModel'
>;

export function saveAiProviderSettings(
  userId: string,
  settings: AiProviderSettings,
): Promise<PersistenceResult<AiProviderSettings>>;
```

- [ ] **Step 1: Write the failing repository tests**

Replace the Gemini-only save coverage with tests that call:

```ts
const input: AiProviderSettings = {
  aiProvider: 'openai-compatible',
  geminiApiKey: 'gemini-key',
  openAICompatibleBaseUrl: '  https://integrate.8686.vn/v1/  ',
  openAICompatibleToken: '  compat-token  ',
  openAICompatibleModel: '  deepseek-ai/deepseek-v4-flash  ',
};

await expect(saveAiProviderSettings('owner-user', input)).resolves.toEqual({
  data: {
    ...input,
    openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
    openAICompatibleToken: 'compat-token',
    openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
  },
  error: null,
});
```

Assert the single update contains all five database columns, scopes by
`user_id`, and selects the same columns after update. Add cases for a `null`
OpenAI-compatible token and for a database error whose returned message does
not contain either submitted credential.

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
npm test -- src/features/persistence/settingsRepository.test.ts
```

Expected: FAIL because `saveAiProviderSettings` is not exported.

- [ ] **Step 3: Implement the atomic repository operation**

Normalize values without validating URL syntax at the repository layer:

```ts
const normalized: AiProviderSettings = {
  aiProvider: settings.aiProvider,
  geminiApiKey: settings.geminiApiKey?.trim() || null,
  openAICompatibleBaseUrl:
    settings.openAICompatibleBaseUrl.trim().replace(/\/+$/, ''),
  openAICompatibleToken:
    settings.openAICompatibleToken?.trim() || null,
  openAICompatibleModel: settings.openAICompatibleModel.trim(),
};
```

Update and return all five provider columns in one Supabase statement.
Replace App usage of the Gemini-only repository function in Task 5; retain
`saveGeminiApiKey` temporarily until that wiring changes.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npm test -- src/features/persistence/settingsRepository.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/persistence/settingsRepository.ts src/features/persistence/settingsRepository.test.ts
git commit -m "feat: persist AI provider configuration"
```

---

### Task 3: Extract the Shared Word-Analysis Contract

**Files:**
- Create: `src/features/ai/wordAnalysis.ts`
- Create: `src/features/ai/wordAnalysis.test.ts`
- Modify: `src/features/gemini/geminiClient.ts`
- Modify: `src/features/gemini/geminiClient.test.ts`

**Interfaces:**
- Produces:

```ts
export type AiErrorKind =
  | 'missing-config'
  | 'quota'
  | 'invalid-key'
  | 'temporary'
  | 'http'
  | 'network'
  | 'invalid-response';

export class AiRequestError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
}

export type WordAnalysis = {
  word: string;
  canonicalWord: string;
  ipa: string;
  partOfSpeech: string;
  vietnameseMeaning: string;
  wordStructure: Array<{
    text: string;
    type: WordPartType;
    meaningVi: string;
    order: number;
  }>;
  meanings: Array<{
    meaningVi: string;
    definitionEn: string;
    partOfSpeech: string;
    examples: Array<{
      sentence: string;
      expectedAnswer: string;
      baseWord: string;
      wordForm: string;
      partOfSpeech: string;
      difficulty: 'easy' | 'medium' | 'hard';
    }>;
  }>;
  wordFamily: string[];
};

export function buildWordAnalysisPrompt(word: string): string;
export function parseWordAnalysisJson(text: string): WordAnalysis;
```

- [ ] **Step 1: Write failing shared-contract tests**

Move representative parser cases into `wordAnalysis.test.ts` and import the
new API:

```ts
it('parses and normalizes a valid provider-independent analysis', () => {
  const result = parseWordAnalysisJson(JSON.stringify(ANALYSIS));
  expect(result.canonicalWord).toBe('transport');
  expect(result.meanings[0].examples).toHaveLength(3);
});

it('rejects markdown fences instead of treating them as JSON', () => {
  expect(() => parseWordAnalysisJson(
    `\`\`\`json\n${JSON.stringify(ANALYSIS)}\n\`\`\``,
  )).toThrowError(AiRequestError);
});
```

Add a prompt assertion that covers canonicalization, Vietnamese-only meanings,
exactly three examples, and exact-surface morphology.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npm test -- src/features/ai/wordAnalysis.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Extract without changing behavior**

Move `GeminiWordAnalysis`, prompt construction, validation sets, morphology
normalization, duplicate-part-of-speech merging, and JSON parsing into
`wordAnalysis.ts`. Rename the shared result to `WordAnalysis`.

Keep compatibility exports in `geminiClient.ts`:

```ts
export type GeminiWordAnalysis = WordAnalysis;

export class GeminiRequestError extends AiRequestError {
  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(kind, message, status);
    this.name = 'GeminiRequestError';
  }
}
```

Gemini continues building the same `generationConfig.responseSchema`. Export
the schema from `wordAnalysis.ts` as `WORD_ANALYSIS_RESPONSE_SCHEMA` so the
request body is byte-for-byte equivalent after JSON serialization.

- [ ] **Step 4: Lock Gemini transport behavior**

Retain the existing test assertion for:

```ts
expect(fetch).toHaveBeenCalledWith(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  expect.objectContaining({
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': personalKey,
    },
  }),
);
```

Update the valid Gemini response path to call `parseWordAnalysisJson`. Gemini
may strip its historically supported JSON fence before calling the strict
shared parser; the OpenAI-compatible transport must not strip fences.

- [ ] **Step 5: Run shared and Gemini tests and verify GREEN**

Run:

```bash
npm test -- src/features/ai/wordAnalysis.test.ts src/features/gemini/geminiClient.test.ts
npm run lint
```

Expected: PASS with unchanged Gemini request assertions.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai/wordAnalysis.ts src/features/ai/wordAnalysis.test.ts src/features/gemini/geminiClient.ts src/features/gemini/geminiClient.test.ts
git commit -m "refactor: share AI word analysis contract"
```

---

### Task 4: Implement the OpenAI-Compatible Transport and Router

**Files:**
- Create: `src/features/openai/openAICompatibleClient.ts`
- Create: `src/features/openai/openAICompatibleClient.test.ts`
- Create: `src/features/ai/aiClient.ts`
- Create: `src/features/ai/aiClient.test.ts`

**Interfaces:**
- Consumes: `WordAnalysis`, `AiRequestError`, `buildWordAnalysisPrompt`, and
  `parseWordAnalysisJson`.
- Produces:

```ts
export type OpenAICompatibleConfig = {
  baseUrl: string;
  token: string;
  model: string;
};

export function normalizeOpenAICompatibleBaseUrl(value: string): string;

export function analyzeWordWithOpenAICompatible(input: {
  config: OpenAICompatibleConfig;
  word: string;
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis>;

export function analyzeWordWithAI(input: {
  provider: AiProvider;
  word: string;
  geminiApiKey: string | null;
  openAICompatible: {
    baseUrl: string;
    token: string | null;
    model: string;
  };
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis>;
```

- [ ] **Step 1: Write failing URL and request tests**

Cover normalization:

```ts
expect(normalizeOpenAICompatibleBaseUrl(
  ' https://integrate.8686.vn/v1/// ',
)).toBe('https://integrate.8686.vn/v1');

for (const invalid of [
  'http://integrate.8686.vn/v1',
  '/v1',
  'https://user:pass@example.com/v1',
  'https://example.com/v1?x=1',
  'https://example.com/v1#fragment',
]) {
  expect(() => normalizeOpenAICompatibleBaseUrl(invalid))
    .toThrowError(AiRequestError);
}
```

Cover the verified request:

```ts
await analyzeWordWithOpenAICompatible({
  config: {
    baseUrl: 'https://integrate.8686.vn/v1/',
    token: 'compat-secret',
    model: 'deepseek-ai/deepseek-v4-flash',
  },
  word: 'running',
  fetchImpl,
});

expect(fetchImpl).toHaveBeenCalledWith(
  'https://integrate.8686.vn/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer compat-secret',
      'Content-Type': 'application/json',
    },
    body: expect.any(String),
  },
);

const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
expect(body).toMatchObject({
  model: 'deepseek-ai/deepseek-v4-flash',
  response_format: {type: 'json_object'},
});
expect(body).not.toHaveProperty('temperature');
```

- [ ] **Step 2: Run the transport test and verify RED**

Run:

```bash
npm test -- src/features/openai/openAICompatibleClient.test.ts
```

Expected: FAIL because the transport module does not exist.

- [ ] **Step 3: Implement minimal normalization and transport**

Validate through `new URL(value.trim())`, reject every condition listed in
Step 1, remove all trailing path slashes, and send:

```ts
body: JSON.stringify({
  model: normalizedModel,
  messages: [
    {
      role: 'system',
      content: 'Return one valid JSON object only. Do not use Markdown fences.',
    },
    {role: 'user', content: buildWordAnalysisPrompt(normalizedWord)},
  ],
  response_format: {type: 'json_object'},
})
```

Read only a non-empty string at `choices[0].message.content`, then pass it
unchanged to `parseWordAnalysisJson`.

- [ ] **Step 4: Add failing safe-error tests**

Test `401`, `403`, `429`, `408`, `425`, `500`, `502`, `503`, `504`, another
non-success status, malformed response envelopes, invalid JSON, and a rejected
fetch. For each submitted token, assert:

```ts
expect(error.message).not.toContain(token);
expect(JSON.stringify(error)).not.toContain(token);
```

Expected kinds are `invalid-key`, `quota`, `temporary`, `http`,
`invalid-response`, and `network` respectively.

- [ ] **Step 5: Implement status mapping and verify GREEN**

Implement exact status groups from the spec. Network failures use a message
that mentions either network or CORS without claiming which one occurred.

Run:

```bash
npm test -- src/features/openai/openAICompatibleClient.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write the failing provider-router tests**

Test both branches with injected `fetchImpl`:

```ts
await analyzeWordWithAI({
  provider: 'openai-compatible',
  word: 'running',
  geminiApiKey: 'unused-gemini-key',
  openAICompatible: {
    baseUrl: 'https://integrate.8686.vn/v1',
    token: 'compat-token',
    model: 'deepseek-ai/deepseek-v4-flash',
  },
  fetchImpl,
});

expect(fetchImpl).toHaveBeenCalledWith(
  'https://integrate.8686.vn/v1/chat/completions',
  expect.any(Object),
);
```

Add the equivalent Gemini assertion and missing-selected-provider credential
cases.

- [ ] **Step 7: Implement routing and run all AI tests**

Route only by the explicit provider. Do not inspect which credential happens
to be present and do not fall back.

Run:

```bash
npm test -- src/features/ai src/features/gemini src/features/openai
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/openai/openAICompatibleClient.ts src/features/openai/openAICompatibleClient.test.ts src/features/ai/aiClient.ts src/features/ai/aiClient.test.ts
git commit -m "feat: call OpenAI-compatible chat completions"
```

---

### Task 5: Add Provider Controls to Settings

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Modify: `src/components/SettingsView.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/persistence/settingsRepository.ts`

**Interfaces:**
- Consumes: `AiProviderSettings` and `saveAiProviderSettings`.
- `SettingsView` replaces `onSaveGeminiApiKey` with:

```ts
onSaveAiProviderSettings: (
  providerSettings: AiProviderSettings,
) => Promise<boolean>;
```

- [ ] **Step 1: Write failing provider UI tests**

Render with `aiProvider: 'gemini'`, choose `OpenAI-compatible`, and assert the
three labeled inputs appear:

```ts
fireEvent.change(screen.getByLabelText('Nhà cung cấp AI'), {
  target: {value: 'openai-compatible'},
});

fireEvent.change(screen.getByLabelText('Base URL'), {
  target: {value: ' https://integrate.8686.vn/v1/ '},
});
fireEvent.change(screen.getByLabelText('Token'), {
  target: {value: ' compat-token '},
});
fireEvent.change(screen.getByLabelText('Model'), {
  target: {value: ' deepseek-ai/deepseek-v4-flash '},
});
fireEvent.click(screen.getByRole('button', {
  name: 'Lưu cấu hình OpenAI-compatible',
}));

await waitFor(() => expect(onSaveAiProviderSettings).toHaveBeenCalledWith(
  expect.objectContaining({
    aiProvider: 'openai-compatible',
    openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
    openAICompatibleToken: 'compat-token',
    openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
  }),
));
```

Add tests for provider switching, password input type, invalid HTTP/relative/
credential/query/fragment URLs, failed saves retaining editable values, saving
base URL/model with the existing token, and clearing only the token.

- [ ] **Step 2: Run the Settings test and verify RED**

Run:

```bash
npm test -- src/components/SettingsView.test.tsx
```

Expected: FAIL because the provider selector and OpenAI-compatible fields do
not exist.

- [ ] **Step 3: Implement the settings controls**

Reuse `normalizeOpenAICompatibleBaseUrl` for client-side validation. Keep
provider fields in local state initialized from `settings`. When saving:

```ts
await onSaveAiProviderSettings({
  aiProvider,
  geminiApiKey: geminiApiKey.trim() || null,
  openAICompatibleBaseUrl: normalizedBaseUrl,
  openAICompatibleToken: openAICompatibleToken.trim() || null,
  openAICompatibleModel: openAICompatibleModel.trim(),
});
```

Render validation failures with `role="alert"`. Include the browser-direct
credential risk notice from the spec. Do not render token values as normal
text.

- [ ] **Step 4: Write failing App persistence tests**

Mock `saveAiProviderSettings`, submit a provider configuration through
`SettingsView`, and assert App updates `settings` only when persistence
succeeds. Assert a failed save leaves the prior App settings unchanged.

- [ ] **Step 5: Wire App and remove the Gemini-only save path**

Replace `handleSaveGeminiApiKey` with one handler calling
`saveAiProviderSettings(user.id, providerSettings)`. On success, merge the
returned provider fields into App state. Remove `loadGeminiApiKey` and
`saveGeminiApiKey` if they no longer have consumers.

- [ ] **Step 6: Run component and type tests**

Run:

```bash
npm test -- src/components/SettingsView.test.tsx src/App.test.tsx src/features/persistence/settingsRepository.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsView.tsx src/components/SettingsView.test.tsx src/App.tsx src/App.test.tsx src/features/persistence/settingsRepository.ts
git commit -m "feat: configure AI providers in settings"
```

---

### Task 6: Route Single and Batch Auto-Fill Through the Selected Provider

**Files:**
- Modify: `src/components/AddWordModal.tsx`
- Modify: `src/components/AddWordModal.test.tsx`
- Modify: `src/components/AddWordModalImage.test.tsx`
- Modify: `src/features/persistence/persistence.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `analyzeWordWithAI` and the provider fields on `UserSettings`.
- `AddWordModal` consumes:

```ts
aiSettings: Pick<
  UserSettings,
  | 'aiProvider'
  | 'geminiApiKey'
  | 'openAICompatibleBaseUrl'
  | 'openAICompatibleToken'
  | 'openAICompatibleModel'
>;
```

- [ ] **Step 1: Write the failing single-word component test**

Render `AddWordModal` with OpenAI-compatible settings, click `AI Auto-Fill`,
and mock:

```ts
fetch.mockResolvedValue(new Response(JSON.stringify({
  choices: [{
    message: {content: JSON.stringify(ANALYSIS)},
    finish_reason: 'stop',
  }],
}), {status: 200}));
```

Assert the request URL, Bearer header, model, `response_format`, and filled
canonical word. Also assert the Gemini key is absent from the serialized
OpenAI-compatible request.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- src/components/AddWordModal.test.tsx
```

Expected: FAIL because the modal accepts only `geminiApiKey`.

- [ ] **Step 3: Implement single-word routing**

Replace the Gemini-only prop and call with:

```ts
await analyzeWordWithAI({
  provider: aiSettings.aiProvider,
  word,
  geminiApiKey: aiSettings.geminiApiKey,
  openAICompatible: {
    baseUrl: aiSettings.openAICompatibleBaseUrl,
    token: aiSettings.openAICompatibleToken,
    model: aiSettings.openAICompatibleModel,
  },
});
```

Catch `AiRequestError` for safe user messages. Keep the current draft untouched
on all failures.

- [ ] **Step 4: Write the failing batch and no-fallback tests**

Add a batch test with two words and assert two sequential Chat Completions
requests use the selected configuration. Add a missing OpenAI-compatible token
test with a valid Gemini key and assert no request is made and no Gemini
fallback occurs.

- [ ] **Step 5: Implement batch routing**

Use the same `analyzeWordWithAI` input inside the existing sequential batch
loop. Preserve existing per-word progress and failure reporting.

- [ ] **Step 6: Update all modal call sites and fixtures**

In App, pass:

```tsx
<AddWordModal
  aiSettings={{
    aiProvider: settings.aiProvider,
    geminiApiKey: settings.geminiApiKey,
    openAICompatibleBaseUrl: settings.openAICompatibleBaseUrl,
    openAICompatibleToken: settings.openAICompatibleToken,
    openAICompatibleModel: settings.openAICompatibleModel,
  }}
  // existing props
/>
```

Update every test renderer to use either `INITIAL_SETTINGS` or an explicit
`aiSettings` object.

- [ ] **Step 7: Run modal and persistence regressions**

Run:

```bash
npm test -- src/components/AddWordModal.test.tsx src/components/AddWordModalImage.test.tsx src/features/persistence/persistence.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/AddWordModal.tsx src/components/AddWordModal.test.tsx src/components/AddWordModalImage.test.tsx src/features/persistence/persistence.test.ts src/App.tsx
git commit -m "feat: use selected AI provider for auto-fill"
```

---

### Task 7: Verify Security Boundaries and the Complete Feature

**Files:**
- Modify if assertions require it: `src/features/persistence/vocabularyRepository.ts`
- Modify: `src/features/persistence/persistence.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes the completed feature; produces no new runtime interface.

- [ ] **Step 1: Add failing credential-exclusion regressions**

Assert the learner-state query explicitly selects the required settings
columns, while any admin query and export payload omit:

```ts
[
  'gemini_api_key',
  'openai_compatible_token',
]
```

Add a logging spy around failed AI requests:

```ts
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
// trigger failure with both secret marker strings
expect(JSON.stringify(consoleError.mock.calls)).not.toContain('gemini-secret');
expect(JSON.stringify(consoleError.mock.calls)).not.toContain('compat-secret');
```

- [ ] **Step 2: Run focused security verification**

Run:

```bash
npm test -- src/features/persistence/persistence.test.ts src/features/openai/openAICompatibleClient.test.ts src/components/AddWordModal.test.tsx
```

Expected: PASS. A failure identifies the exact leaking query, payload, or log
call that Step 3 must correct before proceeding.

- [ ] **Step 3: Make only the minimal security corrections**

Use explicit Supabase column lists instead of `select('*')` wherever an admin
or export path touches `user_settings`. Remove request/error logging that can
serialize headers or provider configuration. Do not add encryption or a proxy,
which are outside the approved architecture.

- [ ] **Step 4: Document browser-direct setup**

In `README.md`, add a concise section that states:

```text
OpenAI-compatible configuration uses a base URL such as
https://integrate.8686.vn/v1 and calls /chat/completions with a Bearer token.
The endpoint must support browser CORS and response_format json_object.
Tokens are synced through owner-only Supabase settings and are available to
the signed-in browser; use restricted, revocable tokens with quota limits.
```

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, TypeScript reports no errors, production build
succeeds, and Git reports no whitespace errors.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat HEAD~6..HEAD
git log -7 --oneline
```

Confirm only the planned AI provider, schema, tests, and documentation changed.

- [ ] **Step 7: Commit final verification updates**

```bash
git add README.md src/features/persistence/vocabularyRepository.ts src/features/persistence/persistence.test.ts
git commit -m "docs: document OpenAI-compatible provider"
```

Omit unchanged paths from `git add`. If no verification correction is needed,
commit only the README update.
