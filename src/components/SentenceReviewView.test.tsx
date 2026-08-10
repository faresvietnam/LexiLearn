import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const {playSentenceAudio} = vi.hoisted(() => ({
  playSentenceAudio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/playSentenceAudio', () => ({playSentenceAudio}));

import {SentenceReviewView} from './SentenceReviewView';
import type {SentenceCard} from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function buildCard(overrides: Partial<SentenceCard> = {}): SentenceCard {
  return {
    id: 'sentence-1',
    imageUrl: 'https://images.example/cat.png',
    imageObjectKey: 'users/user-1/images/cat.png',
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
    ...overrides,
  };
}

describe('SentenceReviewView', () => {
  it('shows a "not enough cards" message and the memory-strength distribution when fewer than 5 sentences exist', () => {
    render(
      <SentenceReviewView
        sentenceCards={[buildCard({nextReviewDate: '2099-01-01T00:00:00.000Z', fsrsState: 2, fsrsRetrievability: 0.9})]}
        onSubmitReview={vi.fn()}
      />,
    );
    expect(screen.getByText('Cần thêm ít nhất 4 câu nữa để đủ 5 câu ôn tập.')).toBeInTheDocument();
    expect(screen.getByText('Số câu đang có: 1')).toBeInTheDocument();
    expect(screen.getByText('Phân bố mức ghi nhớ (Memory Strength)')).toBeInTheDocument();
  });

  it('shows an empty-library message when there are no sentences at all', () => {
    render(<SentenceReviewView sentenceCards={[]} onSubmitReview={vi.fn()} />);
    expect(screen.getByText('Chưa có câu nào.')).toBeInTheDocument();
    expect(screen.getByText('Số câu đang có: 0')).toBeInTheDocument();
  });

  it('shows when to come back once at least 5 sentences exist but none are due yet', () => {
    const cards = Array.from({length: 5}, (_, i) => buildCard({
      id: `sentence-${i + 1}`,
      nextReviewDate: new Date(Date.UTC(2099, 0, 1 + i, 8, 0, 0)).toISOString(),
      fsrsState: 2,
    }));
    render(<SentenceReviewView sentenceCards={cards} onSubmitReview={vi.fn()} />);

    // The 5th-soonest card (index 4) sets the "come back at" time.
    expect(screen.getByText(/Hãy quay lại lúc/)).toBeInTheDocument();
    expect(screen.getByText('Số câu đang có: 5')).toBeInTheDocument();
  });

  it('pauses after a correct typed answer, plays audio immediately, and waits for Tiếp tục', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard({fsrsState: 2})]} onSubmitReview={onSubmitReview} />);

    expect(screen.getByText('Con mèo đang ngủ.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {
      target: {value: 'The cat sleeps.'},
    });
    now = 12_000; // matches expectedTypingResponseTimeMs(3) for "The cat sleeps." -> normal pace
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    expect(screen.getByText('Chính xác!')).toBeInTheDocument();
    expect(playSentenceAudio).toHaveBeenCalledWith('The cat sleeps.', undefined);
    expect(onSubmitReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/}));
    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Good'));
  });

  it('continues from the correct pause on Enter, and replays audio on p', () => {
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard({fsrsState: 2})]} onSubmitReview={onSubmitReview} />);

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {
      target: {value: 'The cat sleeps.'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));
    expect(playSentenceAudio).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, {key: 'p'});
    expect(playSentenceAudio).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, {key: 'Enter'});
    expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', expect.any(String));
  });

  it('ignores p while the answer input has focus', () => {
    render(<SentenceReviewView sentenceCards={[buildCard({fsrsState: 2})]} onSubmitReview={vi.fn()} />);

    const input = screen.getByLabelText('Viết lại câu tiếng Anh');
    input.focus();
    fireEvent.keyDown(input, {key: 'p'});

    expect(playSentenceAudio).not.toHaveBeenCalled();
  });

  it('shows the image as the prompt when random picks image', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    render(<SentenceReviewView sentenceCards={[buildCard()]} onSubmitReview={vi.fn()} />);
    expect(screen.getByAltText('Gợi ý')).toBeInTheDocument();
    expect(screen.queryByText('Con mèo đang ngủ.')).not.toBeInTheDocument();
  });

  it('shows a plain wrong hint (no diff) for the first two wrong attempts, then Hard on the correct 3rd try', async () => {
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard({fsrsState: 2})]} onSubmitReview={onSubmitReview} />);
    const submit = () => fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong one'}});
    submit();
    expect(await screen.findByText('Sai rồi, thử lại.')).toBeInTheDocument();
    expect(screen.queryByTestId('character-diff-user-row')).not.toBeInTheDocument();
    expect(playSentenceAudio).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong two'}});
    submit();
    expect(await screen.findByText('Sai rồi, thử lại.')).toBeInTheDocument();
    expect(screen.queryByTestId('character-diff-user-row')).not.toBeInTheDocument();
    expect(playSentenceAudio).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'The cat sleeps.'}});
    submit();
    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/}));

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Hard'));
  });

  it('auto-plays audio on the 3rd-wrong-attempt reveal and continues on Enter', async () => {
    const cards = [
      buildCard({fsrsState: 2}),
      buildCard({id: 'sentence-2', englishSentence: 'Dogs bark.', fsrsState: 2}),
    ];
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={cards} onSubmitReview={onSubmitReview} />);
    const submit = () => fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong one'}});
    submit();
    await screen.findByText('Sai rồi, thử lại.');

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong two'}});
    submit();
    await screen.findByText('Sai rồi, thử lại.');

    fireEvent.change(screen.getByLabelText('Viết lại câu tiếng Anh'), {target: {value: 'wrong three'}});
    submit();

    expect(await screen.findByTestId('character-diff-user-row')).toBeInTheDocument();
    expect(playSentenceAudio).toHaveBeenCalledWith('The cat sleeps.', undefined);

    fireEvent.keyDown(window, {key: 'Enter'});

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Again'));
    await waitFor(() => expect(screen.getByText('Câu 2 / 2')).toBeInTheDocument());
  });

  it('renders the word-order question for a not-yet-mastered card and rates a correct, on-pace arrangement Good', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={[buildCard({fsrsState: 0})]} onSubmitReview={onSubmitReview} />);

    expect(screen.getByText('Sắp xếp thành câu tiếng Anh')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps'}));
    now = 4_000; // matches expectedWordOrderResponseTimeMs(3) -> normal pace
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    expect(onSubmitReview).not.toHaveBeenCalled();
    expect(playSentenceAudio).toHaveBeenCalledWith('The cat sleeps.', undefined);

    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/}));
    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Good'));
  });

  it('rates Again after 3 wrong word-order attempts and advances on continue', async () => {
    const cards = [
      buildCard({fsrsState: 0}),
      buildCard({id: 'sentence-2', englishSentence: 'Dogs bark.', fsrsState: 0}),
    ];
    const onSubmitReview = vi.fn().mockResolvedValue(true);
    render(<SentenceReviewView sentenceCards={cards} onSubmitReview={onSubmitReview} />);
    const submitWrongOrder = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps'}));
      fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));
    };
    const undoAll = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps'}));
    };

    submitWrongOrder();
    undoAll();
    submitWrongOrder();
    undoAll();
    submitWrongOrder();

    expect(await screen.findByText('The cat sleeps.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/}));

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith('sentence-1', 'Again'));
    await waitFor(() => expect(screen.getByText('Câu 2 / 2')).toBeInTheDocument());
  });
});
