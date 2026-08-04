import {
  AiRequestError,
  type WordAnalysis,
} from '../ai/wordAnalysis';

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
  if (status === 401) {
    return new AiRequestError(
      'invalid-key',
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
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
  if ([502, 503, 504].includes(status)) {
    return new AiRequestError(
      'temporary',
      'Nhà cung cấp OpenAI-compatible đang tạm thời không khả dụng.',
      status,
    );
  }
  return new AiRequestError(
    status === 422 ? 'invalid-response' : 'http',
    'OpenAI-compatible không thể phân tích từ này.',
    status,
  );
}

export async function analyzeWordWithOpenAICompatible({
  accessToken,
  word,
  fetchImpl = fetch,
}: {
  accessToken: string;
  word: string;
  fetchImpl?: typeof fetch;
}): Promise<WordAnalysis> {
  if (!accessToken.trim()) {
    throw new AiRequestError(
      'missing-config',
      'Bạn cần đăng nhập để dùng OpenAI-compatible.',
    );
  }

  try {
    const response = await fetchImpl('/api/ai/analyze', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({word: word.trim()}),
    });
    if (!response.ok) throw httpError(response.status);
    return await response.json() as WordAnalysis;
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError(
      'network',
      'Không thể kết nối dịch vụ AI của ứng dụng.',
    );
  }
}
