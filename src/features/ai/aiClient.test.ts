import {describe, expect, it, vi} from 'vitest';
import {analyzeWordWithAI} from './aiClient';

describe('AI provider router', () => {
  it('does not fall back to Gemini when the selected compatible provider lacks a token', async () => {
    const fetchImpl = vi.fn();

    await expect(analyzeWordWithAI({
      provider: 'openai-compatible',
      word: 'run',
      geminiApiKey: 'available-but-unselected',
      openAICompatible: {
        baseUrl: 'https://integrate.8686.vn/v1',
        token: null,
        model: 'deepseek-ai/deepseek-v4-flash',
      },
      fetchImpl,
    })).rejects.toMatchObject({kind: 'missing-config'});

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
