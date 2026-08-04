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

function chatResponse(content = JSON.stringify(ANALYSIS), status = 200) {
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    choices: [{
      index: 0,
      message: {content, role: 'assistant', reasoning_content: null},
      finish_reason: 'stop',
      logprobs: null,
    }],
    model: 'deepseek-ai/deepseek-v4-flash',
    object: 'chat.completion',
  }), {status});
}

describe('OpenAI-compatible client', () => {
  it('normalizes only safe HTTPS base URLs', () => {
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

  it('sends the verified Chat Completions contract and parses its JSON content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chatResponse());

    const result = await analyzeWordWithOpenAICompatible({
      config: {
        baseUrl: 'https://integrate.8686.vn/v1/',
        token: 'compat-secret',
        model: 'deepseek-ai/deepseek-v4-flash',
      },
      word: 'running',
      fetchImpl,
    });

    expect(result.canonicalWord).toBe('run');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://integrate.8686.vn/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer compat-secret',
          'Content-Type': 'application/json',
        },
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'deepseek-ai/deepseek-v4-flash',
      response_format: {type: 'json_object'},
    });
    expect(body).not.toHaveProperty('temperature');
  });

  it.each([
    [401, 'invalid-key'],
    [403, 'invalid-key'],
    [429, 'quota'],
    [408, 'temporary'],
    [425, 'temporary'],
    [500, 'temporary'],
    [502, 'temporary'],
    [503, 'temporary'],
    [504, 'temporary'],
    [422, 'http'],
  ] as const)('maps HTTP %s to a safe %s error', async (status, kind) => {
    const token = 'never-leak-this-token';
    const fetchImpl = vi.fn().mockResolvedValue(chatResponse('{}', status));

    const promise = analyzeWordWithOpenAICompatible({
      config: {
        baseUrl: 'https://integrate.8686.vn/v1',
        token,
        model: 'deepseek-ai/deepseek-v4-flash',
      },
      word: 'run',
      fetchImpl,
    });

    await expect(promise).rejects.toMatchObject({kind});
    await promise.catch((error: Error) => {
      expect(error.message).not.toContain(token);
      expect(JSON.stringify(error)).not.toContain(token);
    });
  });

  it('reports malformed content and network failures without exposing config', async () => {
    const input = {
      config: {
        baseUrl: 'https://integrate.8686.vn/v1',
        token: 'compat-secret',
        model: 'deepseek-ai/deepseek-v4-flash',
      },
      word: 'run',
    };

    await expect(analyzeWordWithOpenAICompatible({
      ...input,
      fetchImpl: vi.fn().mockResolvedValue(chatResponse('not-json')),
    })).rejects.toMatchObject({kind: 'invalid-response'});

    await expect(analyzeWordWithOpenAICompatible({
      ...input,
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    })).rejects.toMatchObject({kind: 'network'});
  });
});
