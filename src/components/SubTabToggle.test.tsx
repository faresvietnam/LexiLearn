import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SubTabToggle} from './SubTabToggle';

afterEach(cleanup);

describe('SubTabToggle', () => {
  it('marks the active option pressed and reports selection of the other', () => {
    const onSelect = vi.fn();
    render(
      <SubTabToggle
        options={[{id: 'word', label: 'Từ vựng'}, {id: 'sentence', label: 'Câu'}]}
        activeId="word"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('button', {name: 'Từ vựng'})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', {name: 'Câu'})).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', {name: 'Câu'}));
    expect(onSelect).toHaveBeenCalledWith('sentence');
  });
});
