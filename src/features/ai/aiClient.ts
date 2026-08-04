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
  getAccessToken,
  fetchImpl,
}: {
  provider: AiProvider;
  word: string;
  geminiApiKey: string | null;
  getAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis> {
  if (provider === 'openai-compatible') {
    const accessToken = await getAccessToken?.();
    if (!accessToken) {
      throw new AiRequestError(
        'missing-config',
        'Bạn cần đăng nhập để dùng OpenAI-compatible.',
      );
    }
    return analyzeWordWithOpenAICompatible({
      accessToken,
      word,
      fetchImpl,
    });
  }

  if (!geminiApiKey) {
    throw new AiRequestError(
      'missing-config',
      'Chưa có Gemini API key. Hãy lưu key trong Cài đặt hoặc nhập thủ công.',
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
