import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CsvImportModal} from './CsvImportModal';

afterEach(cleanup);

function renderModal() {
  render(
    <CsvImportModal
      existingWords={[]}
      onConfirmImport={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('CsvImportModal validation flow', () => {
  it('parses an uploaded CSV and reports duplicates and invalid rows before import', async () => {
    renderModal();
    const file = new File([
      'Word,Meaning,POS\n"well-being","Trạng thái tốt",noun\nwell being,Trùng,noun\n,Thiếu từ,noun',
    ], 'words.csv', {type: 'text/csv'});

    fireEvent.change(screen.getByLabelText('Tải file CSV'), {
      target: {files: [file]},
    });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(
      'Word,Meaning,POS\n"well-being","Trạng thái tốt",noun\nwell being,Trùng,noun\n,Thiếu từ,noun',
    ));
    fireEvent.click(screen.getByRole('button', {name: /phân tích csv/i}));

    expect(await screen.findByText('well-being')).toBeInTheDocument();
    expect(within(screen.getByText('Dòng trùng lặp đã loại bỏ:').parentElement!)
      .getByText('1')).toBeInTheDocument();
    expect(within(screen.getByText('Dòng lỗi:').parentElement!)
      .getByText('1')).toBeInTheDocument();
  });

  it('keeps the existing paste workflow when no file is selected', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', {name: /phân tích csv/i}));
    await waitFor(() => expect(screen.getByText('transportation')).toBeInTheDocument());
  });
});
