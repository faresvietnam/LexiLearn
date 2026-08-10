import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const {playSentenceAudio} = vi.hoisted(() => ({
  playSentenceAudio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/playSentenceAudio', () => ({playSentenceAudio}));

import {WordOrderQuestion} from './WordOrderQuestion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('WordOrderQuestion', () => {
  it('renders every word as a chip; Kiểm tra is clickable even before any word is placed', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    expect(screen.getByRole('button', {name: 'Kiểm tra'})).not.toBeDisabled();
    ['The', 'cat', 'sleeps.'].forEach((word) => {
      expect(screen.getByRole('button', {name: word})).toBeInTheDocument();
    });
  });

  it('moves a tapped word into the answer row, and back to the pool on a second tap', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    expect(screen.getByRole('button', {name: 'cat'})).toBeInTheDocument();
  });

  it('counts an incomplete arrangement as a wrong attempt instead of blocking the check', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
  });

  it('shows a correct pause, plays the audio, then resolves after another pause', async () => {
    vi.useFakeTimers();
    const onResolve = vi.fn();
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        audioUrl="https://example.com/cat.mp3"
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    expect(screen.getByText('Chính xác!')).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
    expect(playSentenceAudio).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(playSentenceAudio).toHaveBeenCalledWith('The cat sleeps.', 'https://example.com/cat.mp3');
    expect(onResolve).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      isCorrect: true,
      wrongAttempts: 0,
    }));
  });

  it('shows a wrong hint for the first two wrong orders (keeping the arrangement), then reveals on the third', () => {
    const onResolve = vi.fn();
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={onResolve} />);
    const submitWrongOrder = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
      fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));
    };
    const undoAll = () => {
      fireEvent.click(screen.getByRole('button', {name: 'cat'}));
      fireEvent.click(screen.getByRole('button', {name: 'The'}));
      fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    };

    submitWrongOrder();
    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
    undoAll();

    submitWrongOrder();
    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
    undoAll();

    submitWrongOrder();
    expect(screen.getByText('The cat sleeps.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Tiếp tục'}));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      isCorrect: false,
      wrongAttempts: 2,
    }));
  });

  it('adds 3-5 distractor chips from the pool, never duplicating the sentence\'s own words', () => {
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        distractorPool={['dog', 'runs', 'quickly', 'The', 'happy', 'bird', 'sings', 'loudly']}
        onResolve={vi.fn()}
      />,
    );

    const allButtons = screen.getAllByRole('button').map((button) => button.textContent);
    const ownWords = ['The', 'cat', 'sleeps.'];
    const distractorButtons = allButtons.filter(
      (label) => label !== 'Kiểm tra' && !ownWords.includes(label ?? ''),
    );

    expect(distractorButtons.length).toBeGreaterThanOrEqual(3);
    expect(distractorButtons.length).toBeLessThanOrEqual(5);
    distractorButtons.forEach((label) => {
      expect(ownWords.some((word) => word.toLowerCase() === label?.toLowerCase())).toBe(false);
    });
  });
});
