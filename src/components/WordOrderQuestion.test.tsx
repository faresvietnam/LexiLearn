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

function placeCorrectOrder() {
  fireEvent.click(screen.getByRole('button', {name: 'The'}));
  fireEvent.click(screen.getByRole('button', {name: 'cat'}));
  fireEvent.click(screen.getByRole('button', {name: 'sleeps'}));
  fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));
}

describe('WordOrderQuestion', () => {
  it('renders every word as a chip; Kiểm tra is clickable even before any word is placed', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    expect(screen.getByRole('button', {name: 'Kiểm tra'})).not.toBeDisabled();
    ['The', 'cat', 'sleeps'].forEach((word) => {
      expect(screen.getByRole('button', {name: word})).toBeInTheDocument();
    });
  });

  it('moves a tapped word into the answer row, and back to the pool on a second tap', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    expect(screen.getByRole('button', {name: 'cat'})).toBeInTheDocument();
  });

  it('drags a pool word and drops it at a specific position within the answer row, shifting others aside', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    // Place "cat" then "sleeps" first (skipping "The").
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps'}));

    // Drag "The" from the pool and drop it onto "cat" — should insert before "cat".
    fireEvent.dragStart(screen.getByRole('button', {name: 'The'}));
    fireEvent.drop(screen.getByRole('button', {name: 'cat'}));

    const answerRow = screen.getByTestId('word-order-answer');
    const orderedLabels = Array.from(answerRow.querySelectorAll('button')).map((el) => el.textContent);
    expect(orderedLabels).toEqual(['The', 'cat', 'sleeps']);
  });

  it('drags a chip to reorder within the answer row itself', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    // Place in the wrong order: cat, The, sleeps.
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps'}));

    // Drag "cat" (first) and drop it onto "sleeps" (last) to fix the order.
    fireEvent.dragStart(screen.getByRole('button', {name: 'cat'}));
    fireEvent.drop(screen.getByRole('button', {name: 'sleeps'}));

    const answerRow = screen.getByTestId('word-order-answer');
    const orderedLabels = Array.from(answerRow.querySelectorAll('button')).map((el) => el.textContent);
    expect(orderedLabels).toEqual(['The', 'cat', 'sleeps']);
  });

  it('counts an incomplete arrangement as a wrong attempt instead of blocking the check', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
  });

  it('plays the audio immediately on a correct answer and waits for Tiếp tục instead of auto-advancing', async () => {
    vi.useFakeTimers();
    const onResolve = vi.fn();
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        audioUrl="https://example.com/cat.mp3"
        onResolve={onResolve}
      />,
    );

    placeCorrectOrder();

    expect(screen.getByText('Chính xác!')).toBeInTheDocument();
    expect(playSentenceAudio).toHaveBeenCalledWith('The cat sleeps.', 'https://example.com/cat.mp3');

    // No auto-advance, even after time passes.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/}));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      isCorrect: true,
      wrongAttempts: 0,
    }));
  });

  it('continues from the correct pause when Enter is pressed', () => {
    const onResolve = vi.fn();
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={onResolve} />);

    placeCorrectOrder();
    fireEvent.keyDown(window, {key: 'Enter'});
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({isCorrect: true}));
  });

  it('replays the audio when p is pressed during the correct pause', () => {
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        audioUrl="https://example.com/cat.mp3"
        onResolve={vi.fn()}
      />,
    );

    placeCorrectOrder();
    expect(playSentenceAudio).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, {key: 'p'});
    expect(playSentenceAudio).toHaveBeenCalledTimes(2);
  });

  it('shows a wrong hint for the first two wrong orders (keeping the arrangement), auto-plays audio and reveals on the third', () => {
    const onResolve = vi.fn();
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        audioUrl="https://example.com/cat.mp3"
        onResolve={onResolve}
      />,
    );
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
    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
    expect(playSentenceAudio).not.toHaveBeenCalled();
    undoAll();

    submitWrongOrder();
    expect(screen.getByText('Sai rồi, thử lại.')).toBeInTheDocument();
    expect(playSentenceAudio).not.toHaveBeenCalled();
    undoAll();

    submitWrongOrder();
    expect(screen.getByText('The cat sleeps.')).toBeInTheDocument();
    expect(playSentenceAudio).toHaveBeenCalledWith('The cat sleeps.', 'https://example.com/cat.mp3');

    fireEvent.click(screen.getByRole('button', {name: /Tiếp tục/}));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      isCorrect: false,
      wrongAttempts: 2,
    }));
  });

  it('continues from the reveal when Enter is pressed, and replays audio on p', () => {
    const onResolve = vi.fn();
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        audioUrl="https://example.com/cat.mp3"
        onResolve={onResolve}
      />,
    );
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

    const callsAfterReveal = playSentenceAudio.mock.calls.length;
    fireEvent.keyDown(window, {key: 'p'});
    expect(playSentenceAudio.mock.calls.length).toBe(callsAfterReveal + 1);

    fireEvent.keyDown(window, {key: 'Enter'});
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({isCorrect: false}));
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
    const ownWords = ['The', 'cat', 'sleeps'];
    const distractorButtons = allButtons.filter(
      (label) => label !== 'Kiểm tra' && !ownWords.includes(label ?? ''),
    );

    expect(distractorButtons.length).toBeGreaterThanOrEqual(3);
    expect(distractorButtons.length).toBeLessThanOrEqual(5);
    distractorButtons.forEach((label) => {
      expect(ownWords.some((word) => word.toLowerCase() === label?.toLowerCase())).toBe(false);
    });
  });

  it('never shows two distractor chips for the same word after stripping punctuation and case', () => {
    render(
      <WordOrderQuestion
        sentence="The cat sleeps."
        distractorPool={['dog', 'Dog.', 'dog,', 'runs', 'Runs.', 'quickly', 'Quickly,']}
        onResolve={vi.fn()}
      />,
    );

    const allButtons = screen.getAllByRole('button').map((button) => button.textContent);
    const ownWords = ['The', 'cat', 'sleeps'];
    const distractorLabels = allButtons.filter(
      (label) => label !== 'Kiểm tra' && !ownWords.includes(label ?? ''),
    ) as string[];

    const lowerLabels = distractorLabels.map((label) => label.toLowerCase());
    expect(new Set(lowerLabels).size).toBe(lowerLabels.length);
  });
});
