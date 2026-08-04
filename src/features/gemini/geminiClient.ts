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
    meaningVi: string;
    definitionEn: string;
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
  return `Analyze the English word "${word}" for a Vietnamese learner. Return JSON only. Return at most one meanings entry per part of speech. When one part of speech has several common senses, combine their Vietnamese translations in meaningVi and their concise English explanations in definitionEn instead of creating duplicate entries. Never put English text in meaningVi. Include 1-2 representative natural English example sentences per part of speech. Use accurate IPA and up to 5 word-family items. Every wordStructure.text must be an exact consecutive surface substring of "${word}", in order; after removing boundary hyphens, concatenating all parts must equal "${word}" exactly. Do not restore dropped letters or use underlying dictionary forms. If an exact morphology split is unclear or affected by a spelling change, return an empty wordStructure; do not guess.`;
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
          text: {
            type: 'string',
            description: 'Exact consecutive surface substring of the analyzed word.',
          },
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
      maxItems: 5,
      description: 'At most one entry for each unique part of speech.',
      items: {
        type: 'object',
        properties: {
          meaningVi: {
            type: 'string',
            description: 'A concise Vietnamese translation written only in Vietnamese.',
          },
          definitionEn: {
            type: 'string',
            description: 'A concise English dictionary-style definition.',
          },
          partOfSpeech: {
            type: 'string',
            description: 'Part of speech; must be unique within meanings.',
          },
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
        required: ['meaningVi', 'definitionEn', 'partOfSpeech', 'examples'],
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
    && isNonEmptyString(value.meaningVi)
    && typeof value.definitionEn === 'string'
    && isNonEmptyString(value.partOfSpeech)
    && Array.isArray(value.examples)
    && value.examples.every(isExample);
}

function normalizeMorphologyText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\s\u2010-\u2015-]+/g, '');
}

function appendUniqueText(current: string, next: string): string {
  const trimmedCurrent = current.trim();
  const trimmedNext = next.trim();
  if (!trimmedNext) return trimmedCurrent;
  if (!trimmedCurrent) return trimmedNext;
  const normalizedNext = trimmedNext.toLocaleLowerCase('en-US');
  const currentParts = trimmedCurrent
    .split(';')
    .map((part) => part.trim().toLocaleLowerCase('en-US'));
  return currentParts.includes(normalizedNext)
    ? trimmedCurrent
    : `${trimmedCurrent}; ${trimmedNext}`;
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
  const parsedWordStructure =
    (value.wordStructure as Array<Record<string, unknown>>).map((part, index) => ({
      text: part.text as string,
      type: part.type as WordPartType,
      meaning: part.meaning as string,
      order: Number.isInteger(part.order) ? part.order as number : index + 1,
    }));
  const joinedStructure = parsedWordStructure
    .map((part) => normalizeMorphologyText(part.text))
    .join('');
  const wordStructure = joinedStructure === normalizeMorphologyText(word)
    ? parsedWordStructure
    : [];
  const parsedMeanings =
    (value.meanings as Array<Record<string, unknown>>).map((meaning) => {
      const meaningPartOfSpeech = meaning.partOfSpeech as string;
      return {
        meaningVi: meaning.meaningVi as string,
        definitionEn: meaning.definitionEn as string,
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
    });
  const meanings = Array.from(
    parsedMeanings.reduce((grouped, meaning) => {
      const key = meaning.partOfSpeech.trim().toLocaleLowerCase('en-US');
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {...meaning, examples: meaning.examples.slice(0, 2)});
        return grouped;
      }
      const knownSentences = new Set(
        existing.examples.map(({sentence}) => sentence.trim().toLocaleLowerCase('en-US')),
      );
      const newExamples = meaning.examples.filter(
        ({sentence}) => !knownSentences.has(sentence.trim().toLocaleLowerCase('en-US')),
      );
      grouped.set(key, {
        ...existing,
        meaningVi: appendUniqueText(existing.meaningVi, meaning.meaningVi),
        definitionEn: appendUniqueText(existing.definitionEn, meaning.definitionEn),
        examples: [...existing.examples, ...newExamples].slice(0, 2),
      });
      return grouped;
    }, new Map<string, GeminiWordAnalysis['meanings'][number]>()),
  ).map(([, meaning]) => meaning);

  return {
    word,
    ipa: value.ipa as string,
    partOfSpeech: defaultPartOfSpeech,
    vietnameseMeaning: value.vietnameseMeaning as string,
    wordStructure,
    meanings,
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
