import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const {deleteWordImage, uploadWordImage} = vi.hoisted(() => ({
  deleteWordImage: vi.fn().mockResolvedValue(undefined),
  uploadWordImage: vi.fn(),
}));

vi.mock('../features/images/r2ImageUpload', () => ({deleteWordImage, uploadWordImage}));

import {AddSentenceForm} from './AddSentenceForm';
import type {SentenceCard} from '../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  deleteWordImage.mockResolvedValue(undefined);
});

const EXISTING_CARD: SentenceCard = {
  id: 'sentence-1',
  imageUrl: 'https://images.example/original.png',
  imageObjectKey: 'users/user-1/images/original.png',
  englishSentence: 'The cat sleeps.',
  vietnameseSentence: 'Con mèo đang ngủ.',
  createdAt: '2026-08-01T00:00:00.000Z',
  nextReviewDate: '2026-08-01T00:00:00.000Z',
  reviewIntervalDays: 0,
  fsrsState: 0,
  fsrsStability: 0,
  fsrsDifficulty: 0,
  fsrsElapsedDays: 0,
  fsrsScheduledDays: 0,
  fsrsLearningSteps: 0,
  fsrsReps: 0,
  fsrsLapses: 0,
  fsrsRetrievability: 1,
};

describe('AddSentenceForm — create mode', () => {
  it('disables save until an image and both sentences are present', () => {
    render(<AddSentenceForm onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', {name: 'Lưu câu'})).toBeDisabled();
  });

  it('saves image + sentences and closes on success', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<AddSentenceForm onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat.png', {type: 'image/png'})]},
    });
    await screen.findByAltText('Ảnh minh họa xem trước');

    fireEvent.change(screen.getByLabelText('Câu tiếng Anh'), {
      target: {value: 'The cat sleeps.'},
    });
    fireEvent.change(screen.getByLabelText('Câu tiếng Việt'), {
      target: {value: 'Con mèo đang ngủ.'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      imageUrl: 'https://images.example/new.png',
      imageObjectKey: 'users/user-1/images/new.png',
      englishSentence: 'The cat sleeps.',
      vietnameseSentence: 'Con mèo đang ngủ.',
      ipa: '',
      audioUrl: '',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('cleans up an uploaded image when the form unmounts before saving', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    const view = render(<AddSentenceForm onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat.png', {type: 'image/png'})]},
    });
    await screen.findByAltText('Ảnh minh họa xem trước');
    view.unmount();

    await waitFor(() => expect(deleteWordImage).toHaveBeenCalledWith(
      'users/user-1/images/new.png',
    ));
  });

  it('passes optional IPA and audio URL through to onSave', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddSentenceForm onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat.png', {type: 'image/png'})]},
    });
    await screen.findByAltText('Ảnh minh họa xem trước');
    fireEvent.change(screen.getByLabelText('Câu tiếng Anh'), {
      target: {value: 'The cat sleeps.'},
    });
    fireEvent.change(screen.getByLabelText('Câu tiếng Việt'), {
      target: {value: 'Con mèo đang ngủ.'},
    });
    fireEvent.change(screen.getByLabelText('Phiên âm (tuỳ chọn)'), {
      target: {value: '/ðə kæt sliːps/'},
    });
    fireEvent.change(screen.getByLabelText('Link file âm thanh (tuỳ chọn)'), {
      target: {value: 'https://example.com/cat.mp3'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      ipa: '/ðə kæt sliːps/',
      audioUrl: 'https://example.com/cat.mp3',
    })));
  });
});

describe('AddSentenceForm — edit mode', () => {
  it('pre-fills fields and does not delete the existing image when unchanged', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddSentenceForm initialCard={EXISTING_CARD} onSave={onSave} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Câu tiếng Anh')).toHaveValue('The cat sleeps.');
    expect(screen.getByLabelText('Câu tiếng Việt')).toHaveValue('Con mèo đang ngủ.');

    fireEvent.click(screen.getByRole('button', {name: 'Lưu câu'}));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      imageObjectKey: 'users/user-1/images/original.png',
    })));
    expect(deleteWordImage).not.toHaveBeenCalled();
  });

  it('does not delete the original image on a single replace (deletion is the caller\'s job)', async () => {
    uploadWordImage.mockResolvedValue({
      objectKey: 'users/user-1/images/new.png',
      publicUrl: 'https://images.example/new.png',
    });
    render(<AddSentenceForm initialCard={EXISTING_CARD} onSave={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Ảnh minh họa'), {
      target: {files: [new File(['image'], 'cat2.png', {type: 'image/png'})]},
    });
    await waitFor(() => expect(uploadWordImage).toHaveBeenCalledOnce());
    expect(deleteWordImage).not.toHaveBeenCalledWith('users/user-1/images/original.png');
  });
});
