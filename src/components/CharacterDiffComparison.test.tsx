import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CharacterDiffComparison } from './CharacterDiffComparison';

describe('CharacterDiffComparison', () => {
  afterEach(cleanup);

  it('renders a two-line character comparison with removed and added replacement characters', () => {
    render(<CharacterDiffComparison userInput="sporkation" expectedInput="sportation" />);

    const userRow = screen.getByTestId('character-diff-user-row');
    const expectedRow = screen.getByTestId('character-diff-expected-row');

    expect(within(userRow).getByText('- Bạn nhập:')).toBeInTheDocument();
    expect(within(expectedRow).getByText('+ Đáp án:')).toBeInTheDocument();
    expect(within(userRow).getByText('k')).toHaveClass('bg-rose-100', 'text-rose-800');
    expect(within(expectedRow).getByText('k')).toHaveClass('invisible');
    expect(within(userRow).getByText('t')).toHaveClass('invisible');
    expect(within(expectedRow).getByText('t')).not.toHaveClass('bg-emerald-100', 'text-emerald-800', 'text-emerald-700');
  });

  it('colors only correctly entered characters green in the expected row', () => {
    render(<CharacterDiffComparison userInput="sporation" expectedInput="sportation" />);

    const userRow = screen.getByTestId('character-diff-user-row');
    const expectedRow = screen.getByTestId('character-diff-expected-row');

    expect(userRow).toHaveClass('grid', 'grid-cols-[8rem_minmax(0,1fr)]');
    expect(expectedRow).toHaveClass('grid', 'grid-cols-[8rem_minmax(0,1fr)]');
    expect(within(expectedRow).getByText('spor')).toHaveClass('text-emerald-700', 'font-bold');
    expect(within(userRow).getByText('t')).toHaveClass('invisible');
    expect(within(expectedRow).getByText('t')).not.toHaveClass('bg-emerald-100', 'text-emerald-800', 'text-emerald-700');
  });

  it('shows extra characters only in the red learner row', () => {
    render(<CharacterDiffComparison userInput="sportationx" expectedInput="sportation" />);

    const userRow = screen.getByTestId('character-diff-user-row');
    const expectedRow = screen.getByTestId('character-diff-expected-row');

    expect(within(userRow).getByText('x')).toHaveClass('bg-rose-100', 'text-rose-800');
    expect(within(expectedRow).getByText('x')).toHaveClass('invisible');
  });
});
