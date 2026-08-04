import {
  buildPrompt,
  parseAnalysis,
  type GeminiErrorKind,
  type GeminiWordAnalysis,
} from '../gemini/geminiClient';

export type WordAnalysis = GeminiWordAnalysis;
export type AiErrorKind = GeminiErrorKind | 'missing-config';

export class AiRequestError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'AiRequestError';
    this.kind = kind;
    this.status = status;
  }
}

export function buildWordAnalysisPrompt(word: string): string {
  return buildPrompt(word.trim());
}

export function parseWordAnalysisJson(text: string): WordAnalysis {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AiRequestError(
      'invalid-response',
      'Nhà cung cấp AI trả về JSON không hợp lệ. Vui lòng nhập thủ công.',
    );
  }

  try {
    return parseAnalysis(value);
  } catch {
    throw new AiRequestError(
      'invalid-response',
      'Nhà cung cấp AI trả về dữ liệu không hợp lệ. Vui lòng nhập thủ công.',
    );
  }
}
