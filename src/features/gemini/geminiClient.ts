import type {WordPartType} from '../../types';

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const WORD_PART_TYPES = new Set<WordPartType>([
  'prefix',
  'root',
  'base',
  'suffix',
  'combining_form',
  'compound_component',
]);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export type GeminiWordAnalysis = {
  word: string;
  ipa: string;
  partOfSpeech: string;
  vietnameseMeaning: string;
  wordStructure: Array<{
    text: string;
    type: WordPartType;
    meaning: string;
    order: number;
  }>;
  meanings: Array<{
    meaning: string;
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

export type GeminiErrorKind =
  | 'missing-key'
  | 'quota'
  | 'invalid-key'
  | 'temporary'
  | 'http'
  | 'network'
  | 'invalid-response';

export class GeminiRequestError extends Error {
  readonly kind: GeminiErrorKind;
  readonly status?: number;

  constructor(kind: GeminiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'GeminiRequestError';
    this.kind = kind;
    this.status = status;
  }
}

type AnalyzeWordInput = {
  apiKey: string;
  word: string;
  fetchImpl?: typeof fetch;
};

function buildPrompt(word: string) {
  return `Analyze "${word}" for a Vietnamese learner. Return JSON only. Use one concise Vietnamese meaning, one part of speech, accurate IPA, up to 5 morphology parts, up to 5 word-family items, and 1-2 natural example sentences. If morphology is unclear, return an empty list; do not guess.`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    word: {type: 'string'},
    ipa: {type: 'string'},
    partOfSpeech: {type: 'string'},
    vietnameseMeaning: {type: 'string'},
    wordStructure: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
          properties: {
          text: {type: 'string'},
          type: {
            type: 'string',
            enum: [...WORD_PART_TYPES],
          },
          meaning: {type: 'string'},
        },
        required: ['text', 'type', 'meaning'],
      },
    },
    meanings: {
      type: 'array',
      maxItems: 1,
      items: {
        type: 'object',
        properties: {
          meaning: {type: 'string'},
          partOfSpeech: {type: 'string'},
          examples: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'object',
              properties: {
                sentence: {type: 'string'},
              },
              required: ['sentence'],
            },
          },
        },
        required: ['meaning', 'partOfSpeech', 'examples'],
      },
    },
    wordFamily: {
      type: 'array',
      maxItems: 5,
      items: {type: 'string'},
    },
  },
  required: [
    'word',
    'ipa',
    'partOfSpeech',
    'vietnameseMeaning',
    'wordStructure',
    'meanings',
    'wordFamily',
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isWordPart(
  value: unknown,
): value is GeminiWordAnalysis['wordStructure'][number] {
  return isRecord(value)
    && isNonEmptyString(value.text)
    && typeof value.type === 'string'
    && WORD_PART_TYPES.has(value.type as WordPartType)
    && typeof value.meaning === 'string';
}

function isExample(
  value: unknown,
): value is GeminiWordAnalysis['meanings'][number]['examples'][number] {
  return isRecord(value)
    && isNonEmptyString(value.sentence);
}

function isMeaning(
  value: unknown,
): value is GeminiWordAnalysis['meanings'][number] {
  return isRecord(value)
    && isNonEmptyString(value.meaning)
    && isNonEmptyString(value.partOfSpeech)
    && Array.isArray(value.examples)
    && value.examples.every(isExample);
}

function parseAnalysis(value: unknown): GeminiWordAnalysis {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.word)
    || !isNonEmptyString(value.ipa)
    || !isNonEmptyString(value.partOfSpeech)
    || !isNonEmptyString(value.vietnameseMeaning)
    || !Array.isArray(value.wordStructure)
    || !value.wordStructure.every(isWordPart)
    || !Array.isArray(value.meanings)
    || value.meanings.length === 0
    || !value.meanings.every(isMeaning)
    || !Array.isArray(value.wordFamily)
    || !value.wordFamily.every(isNonEmptyString)
  ) {
    throw new GeminiRequestError(
      'invalid-response',
      'Gemini trả về dữ liệu không hợp lệ. Vui lòng nhập thủ công.',
    );
  }

  const word = value.word as string;
  const defaultPartOfSpeech = value.partOfSpeech as string;
  return {
    word,
    ipa: value.ipa as string,
    partOfSpeech: defaultPartOfSpeech,
    vietnameseMeaning: value.vietnameseMeaning as string,
    wordStructure: (value.wordStructure as Array<Record<string, unknown>>).map((part, index) => ({
      text: part.text as string,
      type: part.type as WordPartType,
      meaning: part.meaning as string,
      order: Number.isInteger(part.order) ? part.order as number : index + 1,
    })),
    meanings: (value.meanings as Array<Record<string, unknown>>).map((meaning) => {
      const meaningText = meaning.meaning as string;
      const meaningPartOfSpeech = meaning.partOfSpeech as string;
      return {
        meaning: meaningText,
        partOfSpeech: meaningPartOfSpeech,
        examples: (meaning.examples as Array<Record<string, unknown>>).map((example) => ({
          sentence: example.sentence as string,
          expectedAnswer: typeof example.expectedAnswer === 'string'
            ? example.expectedAnswer
            : word,
          baseWord: typeof example.baseWord === 'string'
            ? example.baseWord
            : word,
          wordForm: typeof example.wordForm === 'string' ? example.wordForm : 'base',
          partOfSpeech: typeof example.partOfSpeech === 'string'
            ? example.partOfSpeech
            : meaningPartOfSpeech || defaultPartOfSpeech,
          difficulty: typeof example.difficulty === 'string'
            && DIFFICULTIES.has(example.difficulty)
            ? example.difficulty as 'easy' | 'medium' | 'hard'
            : 'medium',
        })),
      };
    }),
    wordFamily: value.wordFamily as string[],
  };
}

function responseText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) return null;
  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) return null;
  const textPart = parts.find(
    (part) => isRecord(part) && typeof part.text === 'string',
  );
  return isRecord(textPart) && typeof textPart.text === 'string'
    ? textPart.text
    : null;
}

function httpError(status: number): GeminiRequestError {
  if (status === 429) {
    return new GeminiRequestError(
      'quota',
      'Đã đạt hạn mức Gemini. Vui lòng thử lại sau hoặc nhập thủ công.',
      status,
    );
  }
  if (status === 401 || status === 403) {
    return new GeminiRequestError(
      'invalid-key',
      'Gemini API key không hợp lệ hoặc chưa được cấp quyền.',
      status,
    );
  }
  if (status === 408 || status >= 500) {
    return new GeminiRequestError(
      'temporary',
      'Gemini đang tạm thời không khả dụng. Vui lòng thử lại hoặc nhập thủ công.',
      status,
    );
  }
  if (status === 404) {
    return new GeminiRequestError(
      'http',
      'Model Gemini hiện không khả dụng. Vui lòng thử lại sau hoặc nhập thủ công.',
      status,
    );
  }
  return new GeminiRequestError(
    'http',
    'Gemini không thể phân tích từ này. Vui lòng kiểm tra và nhập thủ công.',
    status,
  );
}

export async function analyzeWordWithGemini({
  apiKey,
  word,
  fetchImpl = fetch,
}: AnalyzeWordInput): Promise<GeminiWordAnalysis> {
  const normalizedKey = apiKey.trim();
  const normalizedWord = word.trim();
  if (!normalizedKey) {
    throw new GeminiRequestError(
      'missing-key',
      'Chưa có Gemini API key. Hãy lưu key trong Cài đặt hoặc nhập thủ công.',
    );
  }

  try {
    const response = await fetchImpl(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': normalizedKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{text: buildPrompt(normalizedWord)}],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) throw httpError(response.status);

    const payload: unknown = await response.json();
    const text = responseText(payload);
    if (!text) {
      throw new GeminiRequestError(
        'invalid-response',
        'Gemini không trả về nội dung hợp lệ. Vui lòng nhập thủ công.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(
        text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
      );
    } catch {
      throw new GeminiRequestError(
        'invalid-response',
        'Gemini trả về dữ liệu không hợp lệ. Vui lòng nhập thủ công.',
      );
    }
    return parseAnalysis(parsed);
  } catch (error) {
    if (error instanceof GeminiRequestError) throw error;
    throw new GeminiRequestError(
      'network',
      'Không thể kết nối Gemini. Vui lòng thử lại hoặc nhập thủ công.',
    );
  }
}
