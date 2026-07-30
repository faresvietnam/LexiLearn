import {createClient} from '@supabase/supabase-js';
import {AwsClient} from 'aws4fetch';
import {randomUUID} from 'node:crypto';

const MAX_IMAGE_BYTES = 5 * 1_024 * 1_024;
const EXPIRES_IN_SECONDS = 300;
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

type PresignDependencies = {
  verifyAccessToken: (token: string) => Promise<string | null>;
  signUpload: (input: {
    objectKey: string;
    contentType: string;
    expiresIn: number;
  }) => Promise<string>;
  publicBaseUrl: string;
  randomUUID: () => string;
};

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {status});
}

function bearerToken(request: Request) {
  const match = request.headers.get('authorization')?.match(/^Bearer (.+)$/);
  return match?.[1]?.trim() || null;
}

function publicObjectUrl(baseUrl: string, objectKey: string) {
  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
}

export function createPresignHandler(dependencies: PresignDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json(405, {error: 'Method not allowed.'});
    }

    const token = bearerToken(request);
    if (!token) return json(401, {error: 'Authentication required.'});

    const userId = await dependencies.verifyAccessToken(token);
    if (!userId) return json(401, {error: 'Invalid access token.'});

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json(400, {error: 'Invalid JSON body.'});
    }

    const fileName = typeof body.fileName === 'string'
      ? body.fileName.trim()
      : '';
    const contentType = typeof body.contentType === 'string'
      ? body.contentType
      : '';
    const size = body.size;
    const extension = IMAGE_EXTENSIONS.get(contentType);

    if (
      !fileName
      || !extension
      || typeof size !== 'number'
      || !Number.isInteger(size)
      || size <= 0
      || size > MAX_IMAGE_BYTES
    ) {
      return json(400, {
        error: 'Only JPEG, PNG, or WebP images up to 5 MB are allowed.',
      });
    }

    const objectKey =
      `users/${userId}/images/${dependencies.randomUUID()}.${extension}`;
    const uploadUrl = await dependencies.signUpload({
      objectKey,
      contentType,
      expiresIn: EXPIRES_IN_SECONDS,
    });

    return json(200, {
      uploadUrl,
      objectKey,
      publicUrl: publicObjectUrl(dependencies.publicBaseUrl, objectKey),
      expiresIn: EXPIRES_IN_SECONDS,
    });
  };
}

function runtimeDependencies(): PresignDependencies {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (
    !supabaseUrl
    || !supabaseKey
    || !accountId
    || !accessKeyId
    || !secretAccessKey
    || !bucketName
    || !publicBaseUrl
  ) {
    throw new Error('R2 upload service is not configured.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const signer = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const endpoint =
    `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;

  return {
    verifyAccessToken: async (token) => {
      const {data, error} = await supabase.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    signUpload: async ({objectKey, contentType, expiresIn}) => {
      const url = `${endpoint}/${objectKey}?X-Amz-Expires=${expiresIn}`;
      const signed = await signer.sign(new Request(url, {
        method: 'PUT',
        headers: {'Content-Type': contentType},
      }), {aws: {signQuery: true}});
      return signed.url;
    },
    publicBaseUrl,
    randomUUID,
  };
}

export default {
  async fetch(request: Request) {
    try {
      return await createPresignHandler(runtimeDependencies())(request);
    } catch {
      return json(503, {error: 'Image upload is unavailable.'});
    }
  },
};
