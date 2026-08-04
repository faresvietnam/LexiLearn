import {
  AiRequestError,
  buildWordAnalysisPrompt,
  parseWordAnalysisJson,
  type WordAnalysis,
} from '../ai/wordAnalysis';

export type OpenAICompatibleConfig = {
  baseUrl: string;
  token: string;
  model: string;
};

export function normalizeOpenAICompatibleBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AiRequestError(
      'missing-config',
      'Base URL OpenAI-compatible không hợp lệ.',
    );
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new AiRequestError(
      'missing-config',
      'Base URL phải dùng HTTPS và không chứa thông tin đăng nhập, query hoặc fragment.',
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function httpError(status: number): AiRequestError {
  if (status === 401 || status === 403) {
    return new AiRequestError(
      'invalid-key',
      'Token OpenAI-compatible không hợp lệ hoặc chưa được cấp quyền.',
      status,
    );
  }
  if (status === 429) {
    return new AiRequestError(
      'quota',
      'Đã đạt hạn mức OpenAI-compatible. Vui lòng thử lại sau.',
      status,
    );
  }
  if ([408, 425, 500, 502, 503, 504].includes(status)) {
    return new AiRequestError(
      'temporary',
      'Nhà cung cấp OpenAI-compatible đang tạm thời không khả dụng.',
      status,
    );
  }
  return new AiRequestError(
    'http',
    'OpenAI-compatible không thể phân tích từ này.',
    status,
  );
}

function responseContent(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const choices = (value as {choices?: unknown}).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = choices[0]?.message;
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as {content?: unknown}).content;
  return typeof content === 'string' && content.trim() ? content : null;
}

export async function analyzeWordWithOpenAICompatible({
  config,
  word,
  fetchImpl = fetch,
}: {
  config: OpenAICompatibleConfig;
  word: string;
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis> {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(config.baseUrl);
  const token = config.token.trim();
  const model = config.model.trim();
  if (!token || !model) {
    throw new AiRequestError(
      'missing-config',
      'Chưa nhập đủ token và model OpenAI-compatible trong Cài đặt.',
    );
  }

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Return one valid JSON object only. Do not use Markdown fences.',
          },
          {
            role: 'user',
            content: buildWordAnalysisPrompt(word.trim()),
          },
        ],
        response_format: {type: 'json_object'},
      }),
    });
    if (!response.ok) throw httpError(response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiRequestError(
        'invalid-response',
        'OpenAI-compatible trả về phản hồi không hợp lệ.',
      );
    }
    const content = responseContent(payload);
    if (!content) {
      throw new AiRequestError(
        'invalid-response',
        'OpenAI-compatible không trả về nội dung hợp lệ.',
      );
    }
    return parseWordAnalysisJson(content);
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError(
      'network',
      'Không thể kết nối OpenAI-compatible. Endpoint có thể không cho phép CORS.',
    );
  }
}
