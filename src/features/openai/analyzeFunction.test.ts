import {describe, expect, it, vi} from 'vitest';
import {
  createAnalyzeHandler,
  type AnalyzeFunctionDependencies,
} from '../../../api/ai/analyze';

const ANALYSIS = {
  word: 'running',
  canonicalWord: 'run',
  ipa: '/rʌn/',
  partOfSpeech: 'verb',
  vietnameseMeaning: 'chạy',
  wordStructure: [],
  meanings: [{
    meaningVi: 'chạy',
    definitionEn: 'to move quickly on foot',
    partOfSpeech: 'verb',
    examples: [
      {sentence: 'I run every morning.'},
      {sentence: 'They run around the park.'},
      {sentence: 'We run to catch the bus.'},
    ],
  }],
  wordFamily: ['runner'],
};

function dependencies(
  overrides: Partial<AnalyzeFunctionDependencies> = {},
): AnalyzeFunctionDependencies {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue('user-1'),
    loadProviderSettings: vi.fn().mockResolvedValue({
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      providerToken: 'provider-secret',
      model: 'gpt-5.5',
    }),
    resolveHostname: vi.fn().mockResolvedValue(['104.18.7.192']),
    fetchProvider: vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {content: JSON.stringify(ANALYSIS)},
      }],
    }), {status: 200})),
    ...overrides,
  };
}

function request(body: Record<string, unknown> = {word: 'running'}) {
  return new Request('https://app.example/api/ai/analyze', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('OpenAI-compatible analyze function', () => {
  it('requires a valid Supabase access token', async () => {
    const handler = createAnalyzeHandler(dependencies({
      verifyAccessToken: vi.fn().mockResolvedValue(null),
    }));

    const response = await handler(request());

    expect(response.status).toBe(401);
  });

  it('uses only stored provider settings and returns normalized analysis', async () => {
    const deps = dependencies();
    const handler = createAnalyzeHandler(deps);

    const response = await handler(request({
      word: 'running',
      baseUrl: 'https://attacker.invalid/v1',
      token: 'attacker-token',
      model: 'attacker-model',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      canonicalWord: 'run',
    });
    expect(deps.fetchProvider).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        redirect: 'manual',
        headers: {
          Authorization: 'Bearer provider-secret',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(JSON.stringify(vi.mocked(deps.fetchProvider).mock.calls))
      .not.toContain('attacker-token');
  });

  it('does not expose the stored provider token when the provider fails', async () => {
    const handler = createAnalyzeHandler(dependencies({
      fetchProvider: vi.fn().mockResolvedValue(new Response(
        'provider-secret rejected',
        {status: 401},
      )),
    }));

    const response = await handler(request());

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('provider-secret');
  });

  it('rejects redirects instead of following them', async () => {
    const handler = createAnalyzeHandler(dependencies({
      fetchProvider: vi.fn().mockResolvedValue(new Response(null, {
        status: 302,
        headers: {Location: 'http://127.0.0.1/'},
      })),
    }));

    expect((await handler(request())).status).toBe(502);
  });
});
