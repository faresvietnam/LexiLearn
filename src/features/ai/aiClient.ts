import type {AiProvider} from '../../types';
import {
  analyzeWordWithGemini,
  GeminiRequestError,
} from '../gemini/geminiClient';
import {
  analyzeWordWithOpenAICompatible,
} from '../openai/openAICompatibleClient';
import {AiRequestError, type WordAnalysis} from './wordAnalysis';

export async function analyzeWordWithAI({
  provider,
  word,
  geminiApiKey,
  openAICompatible,
  fetchImpl,
}: {
  provider: AiProvider;
  word: string;
  geminiApiKey: string | null;
  openAICompatible: {
    baseUrl: string;
    token: string | null;
    model: string;
  };
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis> {
  if (provider === 'openai-compatible') {
    if (!openAICompatible.token) {
      throw new AiRequestError(
        'missing-config',
        'Chưa có token OpenAI-compatible. Hãy lưu trong Cài đặt.',
      );
    }
    return analyzeWordWithOpenAICompatible({
      config: {
        baseUrl: openAICompatible.baseUrl,
        token: openAICompatible.token,
        model: openAICompatible.model,
      },
      word,
      fetchImpl,
    });
  }

  if (!geminiApiKey) {
    throw new AiRequestError(
      'missing-config',
      'Chưa có Gemini API key. Hãy lưu trong Cài đặt.',
    );
  }
  try {
    return await analyzeWordWithGemini({
      apiKey: geminiApiKey,
      word,
      fetchImpl,
    });
  } catch (error) {
    if (error instanceof GeminiRequestError) {
      throw new AiRequestError(error.kind, error.message, error.status);
    }
    throw error;
  }
}
