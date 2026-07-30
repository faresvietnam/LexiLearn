import {afterEach, describe, expect, it, vi} from 'vitest';

const {getSupabaseClient} = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({getSupabaseClient}));

import {uploadWordImage} from './r2ImageUpload';
import {deleteWordImage} from './r2ImageUpload';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('uploadWordImage', () => {
  it('does not request an upload URL without an authenticated session', async () => {
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {session: null},
          error: null,
        }),
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(uploadWordImage(
      new File(['image'], 'word.png', {type: 'image/png'}),
    )).rejects.toThrow(/đăng nhập/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads directly to the signed R2 URL and returns only object metadata', async () => {
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {session: {access_token: 'user-access-token'}},
          error: null,
        }),
      },
    });
    const file = new File(['image'], 'word.png', {type: 'image/png'});
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        uploadUrl: 'https://r2.example/signed-put',
        objectKey: 'users/user-1/images/image-1.png',
        publicUrl: 'https://images.example/users/user-1/images/image-1.png',
        expiresIn: 300,
      }), {status: 200, headers: {'Content-Type': 'application/json'}}))
      .mockResolvedValueOnce(new Response(null, {status: 200}));
    vi.stubGlobal('fetch', fetch);

    await expect(uploadWordImage(file)).resolves.toEqual({
      objectKey: 'users/user-1/images/image-1.png',
      publicUrl: 'https://images.example/users/user-1/images/image-1.png',
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/images/presign',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-access-token',
        }),
        body: JSON.stringify({
          fileName: 'word.png',
          contentType: 'image/png',
          size: 5,
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://r2.example/signed-put',
      {
        method: 'PUT',
        headers: {
          'Content-Length': '5',
          'Content-Type': 'image/png',
        },
        body: file,
      },
    );
  });

  it('does not return metadata when the R2 upload fails', async () => {
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {session: {access_token: 'user-access-token'}},
          error: null,
        }),
      },
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        uploadUrl: 'https://r2.example/signed-put',
        objectKey: 'users/user-1/images/image-1.webp',
        publicUrl: 'https://images.example/users/user-1/images/image-1.webp',
        expiresIn: 300,
      }), {status: 200, headers: {'Content-Type': 'application/json'}}))
      .mockResolvedValueOnce(new Response('failed', {status: 403}));
    vi.stubGlobal('fetch', fetch);

    await expect(uploadWordImage(
      new File(['image'], 'word.webp', {type: 'image/webp'}),
    )).rejects.toThrow(/tải ảnh/i);
  });

  it('deletes an uploaded object through the authenticated cleanup endpoint', async () => {
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {session: {access_token: 'user-access-token'}},
          error: null,
        }),
      },
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        deleteUrl: 'https://r2.example/signed-delete',
        objectKey: 'users/user-1/images/image-1.png',
        expiresIn: 300,
      }), {status: 200, headers: {'Content-Type': 'application/json'}}))
      .mockResolvedValueOnce(new Response(null, {status: 204}));
    vi.stubGlobal('fetch', fetch);

    await expect(deleteWordImage(
      'users/user-1/images/image-1.png',
    )).resolves.toBeUndefined();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/images/presign',
      expect.objectContaining({method: 'DELETE'}),
    );
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://r2.example/signed-delete', {
      method: 'DELETE',
    });
  });
});
