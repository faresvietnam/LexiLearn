import {describe, expect, it, vi} from 'vitest';
import {createPresignHandler} from '../../../api/images/presign';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(
  body: Record<string, unknown>,
  authorization = 'Bearer valid-token',
  method = 'POST',
) {
  return new Request('https://lexilearn.example/api/images/presign', {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function dependencies() {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue(USER_ID),
    signUpload: vi.fn().mockResolvedValue('https://r2.example/signed-put'),
    signDelete: vi.fn().mockResolvedValue('https://r2.example/signed-delete'),
    publicBaseUrl: 'https://images.lexilearn.example',
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  };
}

describe('R2 image presign function', () => {
  it('rejects anonymous requests before signing an upload', async () => {
    const deps = dependencies();
    const response = await createPresignHandler(deps)(
      request({
        fileName: 'word.png',
        contentType: 'image/png',
        size: 1_024,
      }, ''),
    );

    expect(response.status).toBe(401);
    expect(deps.verifyAccessToken).not.toHaveBeenCalled();
    expect(deps.signUpload).not.toHaveBeenCalled();
  });

  it.each(['image/svg+xml', 'text/html', 'application/octet-stream'])(
    'rejects the disallowed MIME type %s',
    async (contentType) => {
      const deps = dependencies();
      const response = await createPresignHandler(deps)(
        request({fileName: 'word.svg', contentType, size: 1_024}),
      );

      expect(response.status).toBe(400);
      expect(deps.signUpload).not.toHaveBeenCalled();
    },
  );

  it('rejects files larger than five megabytes', async () => {
    const deps = dependencies();
    const response = await createPresignHandler(deps)(
      request({
        fileName: 'word.webp',
        contentType: 'image/webp',
        size: 5 * 1_024 * 1_024 + 1,
      }),
    );

    expect(response.status).toBe(400);
    expect(deps.signUpload).not.toHaveBeenCalled();
  });

  it('creates a short-lived upload for a server-generated owner-scoped key', async () => {
    const deps = dependencies();
    const response = await createPresignHandler(deps)(
      request({
        fileName: '../../another-user/word.png',
        contentType: 'image/png',
        size: 2_048,
        objectKey: 'users/another-user/images/stolen.png',
      }),
    );

    expect(response.status).toBe(200);
    expect(deps.signUpload).toHaveBeenCalledWith({
      objectKey:
        `users/${USER_ID}/images/22222222-2222-4222-8222-222222222222.png`,
      contentType: 'image/png',
      size: 2_048,
      expiresIn: 300,
    });
    await expect(response.json()).resolves.toEqual({
      uploadUrl: 'https://r2.example/signed-put',
      objectKey:
        `users/${USER_ID}/images/22222222-2222-4222-8222-222222222222.png`,
      publicUrl:
        `https://images.lexilearn.example/users/${USER_ID}/images/22222222-2222-4222-8222-222222222222.png`,
      expiresIn: 300,
    });
  });

  it('only signs deletion for an image owned by the authenticated user', async () => {
    const deps = dependencies();
    const objectKey = `users/${USER_ID}/images/22222222-2222-4222-8222-222222222222.webp`;
    const response = await createPresignHandler(deps)(
      request({objectKey}, 'Bearer valid-token', 'DELETE'),
    );

    expect(response.status).toBe(200);
    expect(deps.signDelete).toHaveBeenCalledWith({objectKey, expiresIn: 300});
    await expect(response.json()).resolves.toMatchObject({
      deleteUrl: 'https://r2.example/signed-delete',
      objectKey,
      expiresIn: 300,
    });
  });

  it('rejects deletion of another user image', async () => {
    const deps = dependencies();
    const response = await createPresignHandler(deps)(
      request({
        objectKey:
          'users/33333333-3333-4333-8333-333333333333/images/22222222-2222-4222-8222-222222222222.png',
      }, 'Bearer valid-token', 'DELETE'),
    );

    expect(response.status).toBe(403);
    expect(deps.signDelete).not.toHaveBeenCalled();
  });
});
