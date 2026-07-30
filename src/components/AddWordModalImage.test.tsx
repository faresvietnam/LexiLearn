import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const {deleteWordImage, uploadWordImage} = vi.hoisted(() => ({
  deleteWordImage: vi.fn().mockResolvedValue(undefined),
  uploadWordImage: vi.fn(),
}));

vi.mock('../features/images/r2ImageUpload', () => ({
  deleteWordImage,
  uploadWordImage,
}));

import {AddWordModal} from './AddWordModal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  deleteWordImage.mockResolvedValue(undefined);
});

function renderModal(onAddWord = vi.fn().mockResolvedValue(true)) {
  render(
    <AddWordModal
      decks={[]}
      tags={[]}
      globalWords={[]}
      linkedGlobalWords={[]}
      onAddWord={onAddWord}
      onLinkExistingGlobalWord={vi.fn().mockResolvedValue(false)}
      onClose={vi.fn()}
    />,
  );
  return onAddWord;
}

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
    target: {value: 'moonshot'},
  });
  fireEvent.change(screen.getByPlaceholderText('e.g. Giao thông vận tải'), {
    target: {value: 'mục tiêu tham vọng'},
  });
}

describe('AddWordModal R2 image upload', () => {
  it('keeps entered word fields intact and omits metadata after upload failure', async () => {
    uploadWordImage.mockRejectedValue(new Error('Không thể tải ảnh lên R2.'));
    const onAddWord = renderModal();
    fillRequiredFields();

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {
        files: [
          new File(['image'], 'word.png', {type: 'image/png'}),
        ],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải ảnh/i,
    );
    expect(screen.getByPlaceholderText('e.g. transportation'))
      .toHaveValue('moonshot');
    expect(screen.getByPlaceholderText('e.g. Giao thông vận tải'))
      .toHaveValue('mục tiêu tham vọng');

    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));
    await waitFor(() => expect(onAddWord).toHaveBeenCalledOnce());
    expect(onAddWord.mock.calls[0][0]).not.toHaveProperty('imageUrl');
    expect(onAddWord.mock.calls[0][0]).not.toHaveProperty('imageObjectKey');
  });

  it('adds R2 object metadata only after the upload succeeds', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/image-1.webp',
      publicUrl: 'https://images.example/users/user-1/images/image-1.webp',
    });
    const onAddWord = renderModal();
    fillRequiredFields();

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {
        files: [
          new File(['image'], 'word.webp', {type: 'image/webp'}),
        ],
      },
    });

    expect(await screen.findByText('Đã tải ảnh lên.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    await waitFor(() => expect(onAddWord).toHaveBeenCalledOnce());
    expect(onAddWord.mock.calls[0][0]).toMatchObject({
      imageObjectKey: 'users/user-1/images/image-1.webp',
      imageUrl: 'https://images.example/users/user-1/images/image-1.webp',
    });
  });

  it('cleans up a successful upload when saving the word fails', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/image-1.png',
      publicUrl: 'https://images.example/users/user-1/images/image-1.png',
    });
    const onAddWord = renderModal(vi.fn().mockResolvedValue(false));
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'word.png', {type: 'image/png'})]},
    });

    await screen.findByText('Đã tải ảnh lên.');
    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    await waitFor(() => expect(deleteWordImage).toHaveBeenCalledWith(
      'users/user-1/images/image-1.png',
    ));
  });

  it('keeps a replacement upload successful when old-image cleanup fails', async () => {
    uploadWordImage
      .mockResolvedValueOnce({
        objectKey: 'users/user-1/images/image-1.png',
        publicUrl: 'https://images.example/users/user-1/images/image-1.png',
      })
      .mockResolvedValueOnce({
        objectKey: 'users/user-1/images/image-2.png',
        publicUrl: 'https://images.example/users/user-1/images/image-2.png',
      });
    deleteWordImage.mockRejectedValueOnce(new Error('cleanup unavailable'));
    renderModal();

    const imageInput = screen.getByLabelText('Ảnh minh họa');
    fireEvent.change(imageInput, {
      target: {files: [new File(['one'], 'one.png', {type: 'image/png'})]},
    });
    await screen.findByText('Đã tải ảnh lên.');
    fireEvent.change(imageInput, {
      target: {files: [new File(['two'], 'two.png', {type: 'image/png'})]},
    });

    await waitFor(() => expect(uploadWordImage).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Đã tải ảnh lên.')).toBeInTheDocument();
  });
});
