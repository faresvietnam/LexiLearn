import {describe, expect, it, vi} from 'vitest';
import {analyzeWordWithAI} from './aiClient';

describe('AI provider router', () => {
  it('does not fall back to Gemini without a Supabase access token', async () => {
    const fetchImpl = vi.fn();

    await expect(analyzeWordWithAI({
      provider: 'openai-compatible',
      word: 'run',
      geminiApiKey: 'available-but-unselected',
      getAccessToken: vi.fn().mockResolvedValue(null),
      fetchImpl,
    })).rejects.toMatchObject({kind: 'missing-config'});

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
