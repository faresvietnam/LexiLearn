import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {WordOrderQuestion} from './WordOrderQuestion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WordOrderQuestion', () => {
  it('renders every word as a chip and disables Kiểm tra until all are placed', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    expect(screen.getByRole('button', {name: 'Kiểm tra'})).toBeDisabled();
    ['The', 'cat', 'sleeps.'].forEach((word) => {
      expect(screen.getByRole('button', {name: word})).toBeInTheDocument();
    });
  });

  it('moves a tapped word into the answer row, and back to the pool on a second tap', () => {
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    expect(screen.getByRole('button', {name: 'Kiểm tra'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    expect(screen.getByRole('button', {name: 'Kiểm tra'})).toBeDisabled();
  });

  it('resolves correct when the words are placed in the right order', () => {
    const onResolve = vi.fn();
    render(<WordOrderQuestion sentence="The cat sleeps." onResolve={onResolve} />);

    fireEvent.click(screen.getByRole('button', {name: 'The'}));
    fireEvent.click(screen.getByRole('button', {name: 'cat'}));
    fireEvent.click(screen.getByRole('button', {name: 'sleeps.'}));
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra'}));

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
});
