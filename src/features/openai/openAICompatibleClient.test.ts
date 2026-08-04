import {describe, expect, it, vi} from 'vitest';
import {AiRequestError} from '../ai/wordAnalysis';
import {
  analyzeWordWithOpenAICompatible,
  normalizeOpenAICompatibleBaseUrl,
} from './openAICompatibleClient';

const ANALYSIS = {
  word: 'running',
  canonicalWord: 'run',
  ipa: '/rʌn/',
  partOfSpeech: 'verb',
  vietnameseMeaning: 'chạy',
  wordStructure: [],
  meanings: [],
  wordFamily: ['runner'],
};

describe('OpenAI-compatible client', () => {
  it('normalizes only safe HTTPS base URLs for the settings form', () => {
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
  });

  it('sends only the word and Supabase access token to the same-origin proxy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(ANALYSIS));

    const result = await analyzeWordWithOpenAICompatible({
      accessToken: 'user-jwt',
      word: ' running ',
      fetchImpl,
    });

    expect(result.canonicalWord).toBe('run');
    expect(fetchImpl).toHaveBeenCalledWith('/api/ai/analyze', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({word: 'running'}),
    });
    expect(JSON.stringify(vi.mocked(fetchImpl).mock.calls))
      .not.toContain('provider');
  });

  it.each([
    [401, 'invalid-key'],
    [429, 'quota'],
    [502, 'temporary'],
    [503, 'temporary'],
    [422, 'invalid-response'],
  ] as const)('maps proxy HTTP %s to %s', async (status, kind) => {
    await expect(analyzeWordWithOpenAICompatible({
      accessToken: 'user-jwt',
      word: 'run',
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, {status})),
    })).rejects.toMatchObject({kind});
  });
});
