import {createClient} from '@supabase/supabase-js';
import {lookup} from 'node:dns/promises';
import {
  buildWordAnalysisPrompt,
  parseWordAnalysisJson,
} from '../../src/features/ai/wordAnalysis.js';
import {validateProviderBaseUrl} from
  '../../src/features/openai/providerUrlPolicy.js';
import type {AiProvider} from '../../src/types/index.js';

type StoredProviderSettings = {
  provider: AiProvider;
  baseUrl: string;
  providerToken: string;
  model: string;
};

export type AnalyzeFunctionDependencies = {
  verifyAccessToken: (token: string) => Promise<string | null>;
  loadProviderSettings: (
    token: string,
    userId: string,
  ) => Promise<StoredProviderSettings | null>;
  resolveHostname: (hostname: string) => Promise<string[]>;
  fetchProvider: typeof fetch;
};

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {status});
}

function bearerToken(request: Request) {
  const match = request.headers.get('authorization')?.match(/^Bearer (.+)$/);
  return match?.[1]?.trim() || null;
}

function providerFailureStatus(status: number) {
  return status === 429 ? 429 : status >= 500 ? 503 : 502;
}

export function createAnalyzeHandler(
  dependencies: AnalyzeFunctionDependencies,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json(405, {error: 'Method not allowed.'});
    }

    const accessToken = bearerToken(request);
    if (!accessToken) return json(401, {error: 'Authentication required.'});

    const userId = await dependencies.verifyAccessToken(accessToken);
    if (!userId) return json(401, {error: 'Invalid access token.'});

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json(400, {error: 'Invalid JSON body.'});
    }
    const word = typeof body.word === 'string' ? body.word.trim() : '';
    if (!word) return json(400, {error: 'Word is required.'});

    const settings = await dependencies.loadProviderSettings(
      accessToken,
      userId,
    );
    if (
      !settings
      || settings.provider !== 'openai-compatible'
      || !settings.baseUrl
      || !settings.providerToken
      || !settings.model
    ) {
      return json(409, {error: 'OpenAI-compatible is not configured.'});
    }

    let baseUrl: string;
    try {
      const hostname = new URL(settings.baseUrl).hostname;
      const addresses = await dependencies.resolveHostname(hostname);
      baseUrl = validateProviderBaseUrl(settings.baseUrl, addresses);
    } catch {
      return json(400, {error: 'Provider URL is not allowed.'});
    }

    let providerResponse: Response;
    try {
      providerResponse = await dependencies.fetchProvider(
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          redirect: 'manual',
          headers: {
            Authorization: `Bearer ${settings.providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              {
                role: 'system',
                content: 'Return exactly one valid JSON object.',
              },
              {
                role: 'user',
                content: buildWordAnalysisPrompt(word),
              },
            ],
            response_format: {type: 'json_object'},
          }),
        },
      );
    } catch (error) {
      console.error('AI provider unreachable', error);
      return json(503, {error: 'AI provider is temporarily unavailable.'});
    }

    if (
      providerResponse.status >= 300
      && providerResponse.status < 400
    ) {
      console.error(
        'AI provider redirected',
        providerResponse.status,
        await providerResponse.text(),
      );
      return json(502, {error: 'AI provider returned an invalid response.'});
    }
    if (!providerResponse.ok) {
      console.error(
        'AI provider request failed',
        providerResponse.status,
        await providerResponse.text(),
      );
      return json(providerFailureStatus(providerResponse.status), {
        error: providerResponse.status === 429
          ? 'AI provider rate limit exceeded.'
          : 'AI provider request failed.',
      });
    }

    try {
      const result = await providerResponse.json() as {
        choices?: Array<{message?: {content?: unknown}}>;
      };
      const content = result.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Missing content');
      return Response.json(parseWordAnalysisJson(content));
    } catch {
      return json(422, {error: 'AI provider returned invalid data.'});
    }
  };
}

function runtimeDependencies(): AnalyzeFunctionDependencies {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseUrl || !supabaseKey || !supabaseSecretKey) {
    throw new Error('AI proxy is not configured.');
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    verifyAccessToken: async (token) => {
      const {data, error} = await authClient.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    loadProviderSettings: async (token, userId) => {
      const client = createClient(supabaseUrl, supabaseSecretKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
      const {data, error} = await client
        .from('user_settings')
        .select(
          'ai_provider, openai_compatible_base_url, '
          + 'openai_compatible_token, openai_compatible_model',
        )
        .eq('user_id', userId)
        .single() as {
          data: {
            ai_provider: AiProvider;
            openai_compatible_base_url: string | null;
            openai_compatible_token: string | null;
            openai_compatible_model: string | null;
          } | null;
          error: unknown | null;
        };
      if (error || !data) return null;
      return {
        provider: data.ai_provider as AiProvider,
        baseUrl: data.openai_compatible_base_url ?? '',
        providerToken: data.openai_compatible_token ?? '',
        model: data.openai_compatible_model ?? '',
      };
    },
    resolveHostname: async (hostname) => {
      const results = await lookup(hostname, {all: true});
      return results.map(({address}) => address);
    },
    fetchProvider: fetch,
  };
}

export default {
  async fetch(request: Request) {
    try {
      return await createAnalyzeHandler(runtimeDependencies())(request);
    } catch {
      return json(503, {error: 'AI proxy is unavailable.'});
    }
  },
};
