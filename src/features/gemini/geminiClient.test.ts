import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  analyzeWordWithGemini,
  GeminiRequestError,
} from './geminiClient';

const ANALYSIS = {
  word: 'transportation',
  ipa: '/ˌtrænspərˈteɪʃn/',
  partOfSpeech: 'noun',
  vietnameseMeaning: 'sự vận chuyển',
  wordStructure: [
    {
      text: 'transport',
      type: 'root',
      meaning: 'carry',
      order: 1,
    },
  ],
  meanings: [
    {
      meaningVi: 'sự vận chuyển',
      definitionEn: 'the movement of people or goods from one place to another',
      partOfSpeech: 'noun',
      examples: [
        {
          sentence: 'Public transportation is convenient.',
          expectedAnswer: 'transportation',
          baseWord: 'transportation',
          wordForm: 'base',
          partOfSpeech: 'noun',
          difficulty: 'medium',
        },
      ],
    },
  ],
  wordFamily: ['transport', 'transportation'],
};

function geminiResponse(text: string) {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{text}],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    }],
    usageMetadata: {
      promptTokenCount: 20,
      candidatesTokenCount: 40,
      totalTokenCount: 60,
    },
    modelVersion: 'gemini-flash-latest',
    responseId: 'response-1',
  }), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}

describe('analyzeWordWithGemini', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the personal key only in the Gemini header and never logs it', async () => {
    const personalKey = 'gemini-personal-secret';
    const fetchImpl = vi.fn().mockResolvedValue(
      geminiResponse(JSON.stringify(ANALYSIS)),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await analyzeWordWithGemini({
      apiKey: personalKey,
      word: ' transportation ',
      fetchImpl,
    });

    expect(result).toEqual(ANALYSIS);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    );
    expect(url).not.toContain(personalKey);
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': personalKey,
      },
    });
    expect(String(init.body)).not.toContain(personalKey);
    expect(JSON.parse(String(init.body))).toMatchObject({
      contents: [{
        parts: [{
          text: expect.stringContaining('transportation'),
        }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: expect.objectContaining({
          properties: expect.objectContaining({
            wordStructure: expect.objectContaining({maxItems: 5}),
            meanings: expect.objectContaining({maxItems: 5}),
            wordFamily: expect.objectContaining({maxItems: 5}),
          }),
        }),
      },
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps the Vietnamese meaning separate from the optional English definition', async () => {
    const analysis = {
      ...ANALYSIS,
      word: 'reusable',
      partOfSpeech: 'adjective',
      vietnameseMeaning: 'có thể tái sử dụng',
      meanings: [{
        meaningVi: 'có thể tái sử dụng',
        definitionEn: 'able to be used again or multiple times',
        partOfSpeech: 'adjective',
        examples: [{
          sentence: 'We should bring reusable bags.',
        }],
      }],
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      geminiResponse(JSON.stringify(analysis)),
    );

    const result = await analyzeWordWithGemini({
      apiKey: 'personal-key',
      word: 'reusable',
      fetchImpl,
    });

    expect(result.meanings).toEqual([expect.objectContaining({
      meaningVi: 'có thể tái sử dụng',
      definitionEn: 'able to be used again or multiple times',
      partOfSpeech: 'adjective',
    })]);
  });

  it('returns actionable quota feedback for a 429 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 429,
        message: 'Quota exceeded',
        status: 'RESOURCE_EXHAUSTED',
      },
    }), {
      status: 429,
      headers: {'Content-Type': 'application/json'},
    }));

    await expect(analyzeWordWithGemini({
      apiKey: 'personal-key',
      word: 'quota',
      fetchImpl,
    })).rejects.toEqual(expect.objectContaining({
      name: 'GeminiRequestError',
      kind: 'quota',
      message: expect.stringMatching(/hạn mức|thử lại/i),
    }));
  });

  it('distinguishes an invalid key from a temporary Gemini failure', async () => {
    const invalidKeyFetch = vi.fn().mockResolvedValue(new Response('{}', {
      status: 403,
      headers: {'Content-Type': 'application/json'},
    }));
    const temporaryFailureFetch = vi.fn().mockResolvedValue(new Response('{}', {
      status: 503,
      headers: {'Content-Type': 'application/json'},
    }));

    await expect(analyzeWordWithGemini({
      apiKey: 'invalid',
      word: 'invalid',
      fetchImpl: invalidKeyFetch,
    })).rejects.toEqual(expect.objectContaining({
      kind: 'invalid-key',
      message: expect.stringMatching(/API key/i),
    }));

    await expect(analyzeWordWithGemini({
      apiKey: 'valid',
      word: 'temporary',
      fetchImpl: temporaryFailureFetch,
    })).rejects.toEqual(expect.objectContaining({
      kind: 'temporary',
      message: expect.stringMatching(/tạm thời|thử lại/i),
    }));
  });

  it('rejects an empty key before making a network request', async () => {
    const fetchImpl = vi.fn();

    await expect(analyzeWordWithGemini({
      apiKey: '   ',
      word: 'manual',
      fetchImpl,
    })).rejects.toBeInstanceOf(GeminiRequestError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed model output with manual-entry feedback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      geminiResponse('{"word":"incomplete"}'),
    );

    await expect(analyzeWordWithGemini({
      apiKey: 'valid',
      word: 'incomplete',
      fetchImpl,
    })).rejects.toEqual(expect.objectContaining({
      kind: 'invalid-response',
      message: expect.stringMatching(/nhập thủ công/i),
    }));
  });
});
