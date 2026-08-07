import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {JsonImportModal} from './JsonImportModal';

afterEach(cleanup);

function renderModal() {
  render(
    <JsonImportModal
      existingWords={[]}
      decks={[]}
      tags={[]}
      onCreateDeck={vi.fn()}
      onCreateTag={vi.fn()}
      onConfirmImport={vi.fn().mockResolvedValue({created: 0, linked: 0, skippedDuplicate: 0, failed: 0})}
      onClose={vi.fn()}
    />,
  );
}

describe('JsonImportModal validation flow', () => {
  it('parses an uploaded JSON file and reports duplicates and invalid entries before import', async () => {
    renderModal();
    const json = JSON.stringify([
      {word: 'well-being', meanings: [{meaning_vi: 'Trạng thái tốt', part_of_speech: 'noun'}]},
      {word: 'well being', meanings: [{meaning_vi: 'Trùng', part_of_speech: 'noun'}]},
      {word: '', meanings: [{meaning_vi: 'Thiếu từ', part_of_speech: 'noun'}]},
    ]);
    const file = new File([json], 'words.json', {type: 'application/json'});

    fireEvent.change(screen.getByLabelText('Tải file JSON'), {
      target: {files: [file]},
    });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(json));
    fireEvent.click(screen.getByRole('button', {name: /phân tích json/i}));

    expect(await screen.findByText('well-being')).toBeInTheDocument();
    expect(within(screen.getByText('Trùng lặp trong file:').parentElement!)
      .getByText('1')).toBeInTheDocument();
    expect(within(screen.getByText('Lỗi:').parentElement!)
      .getByText('1')).toBeInTheDocument();
  });

  it('keeps the existing paste workflow when no file is selected', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', {name: /phân tích json/i}));
    await waitFor(() => expect(screen.getByText('transportation')).toBeInTheDocument());
  });

  it('shows a summary after confirming import', async () => {
    const onConfirmImport = vi.fn().mockResolvedValue({created: 1, linked: 0, skippedDuplicate: 0, failed: 0});
    render(
      <JsonImportModal
        existingWords={[]}
        decks={[]}
        tags={[]}
        onCreateDeck={vi.fn()}
        onCreateTag={vi.fn()}
        onConfirmImport={onConfirmImport}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /phân tích json/i}));
    await screen.findByText('transportation');
    fireEvent.click(screen.getByRole('button', {name: /xác nhận import/i}));

    expect(await screen.findByText(/import json thành công/i)).toBeInTheDocument();
    expect(onConfirmImport).toHaveBeenCalledTimes(1);
  });

  it('copies a JSON-generation prompt naming the deck and the user\'s tags', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {clipboard: {writeText}});

    render(
      <JsonImportModal
        existingWords={[]}
        decks={[]}
        tags={[{id: 'tag_food', name: 'food', color: '#000'}]}
        onCreateDeck={vi.fn()}
        onCreateTag={vi.fn()}
        onConfirmImport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /copy prompt tạo json/i}));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain('"begin"');
    expect(copiedText).toContain('"food"');
    expect(await screen.findByText('Đã copy!')).toBeInTheDocument();
  });
});
