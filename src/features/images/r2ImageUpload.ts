import {getSupabaseClient} from '../../lib/supabase';

export type UploadedImage = {
  objectKey: string;
  publicUrl: string;
};

type PresignResponse = UploadedImage & {
  uploadUrl: string;
  expiresIn: number;
};

export async function uploadWordImage(file: File): Promise<UploadedImage> {
  const client = getSupabaseClient();
  const {data} = client
    ? await client.auth.getSession()
    : {data: {session: null}};
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error('Bạn cần đăng nhập để tải ảnh.');
  }

  const presignResponse = await fetch('/api/images/presign', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });

  if (!presignResponse.ok) {
    throw new Error('Ảnh phải là JPEG, PNG hoặc WebP và không quá 5 MB.');
  }

  const metadata = await presignResponse.json() as PresignResponse;
  const uploadResponse = await fetch(metadata.uploadUrl, {
    method: 'PUT',
    // The Function signs this exact length. Browsers own Content-Length and
    // add the File's matching value automatically; only Content-Type is set.
    headers: {'Content-Type': file.type},
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Không thể tải ảnh lên R2. Vui lòng thử lại.');
  }

  return {
    objectKey: metadata.objectKey,
    publicUrl: metadata.publicUrl,
  };
}

export async function deleteWordImage(objectKey: string): Promise<void> {
  const client = getSupabaseClient();
  const {data} = client
    ? await client.auth.getSession()
    : {data: {session: null}};
  const accessToken = data.session?.access_token;
  if (!accessToken) return;

  const deleteResponse = await fetch('/api/images/presign', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({objectKey}),
  });
  if (!deleteResponse.ok) return;

  const metadata = await deleteResponse.json() as {deleteUrl: string};
  await fetch(metadata.deleteUrl, {method: 'DELETE'});
}
