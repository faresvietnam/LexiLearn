import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  INITIAL_SETTINGS,
  INITIAL_STUDY_SCOPE,
} from '../data/mockData';
import {SettingsView} from './SettingsView';

afterEach(cleanup);

function renderSettings({
  geminiApiKey = null,
  onSaveGeminiApiKey = vi.fn().mockResolvedValue(true),
}: {
  geminiApiKey?: string | null;
  onSaveGeminiApiKey?: (apiKey: string | null) => Promise<boolean>;
} = {}) {
  render(
    <SettingsView
      settings={{...INITIAL_SETTINGS, geminiApiKey}}
      studyScope={INITIAL_STUDY_SCOPE}
      words={[]}
      onUpdateSettings={vi.fn().mockResolvedValue(true)}
      onSaveGeminiApiKey={onSaveGeminiApiKey}
      onExportData={() => undefined}
    />,
  );
}

describe('SettingsView personal Gemini key', () => {
  it('explains browser exposure and saves a trimmed key without displaying it as text', async () => {
    const onSaveGeminiApiKey = vi.fn().mockResolvedValue(true);
    renderSettings({onSaveGeminiApiKey});

    expect(screen.getByText(/trình duyệt.*Gemini/i)).toBeInTheDocument();
    expect(screen.getByText(/mã hóa khi lưu trữ/i)).toBeInTheDocument();
    const keyInput = screen.getByLabelText('Gemini API key');
    expect(keyInput).toHaveAttribute('type', 'password');

    fireEvent.change(keyInput, {target: {value: '  personal-key  '}});
    fireEvent.click(screen.getByRole('button', {
      name: 'Lưu Gemini API key',
    }));

    await waitFor(() => {
      expect(onSaveGeminiApiKey).toHaveBeenCalledWith('personal-key');
    });
    expect(screen.queryByText('personal-key')).not.toBeInTheDocument();
  });

  it('removes an existing key only after persistence succeeds', async () => {
    const onSaveGeminiApiKey = vi.fn().mockResolvedValue(true);
    renderSettings({
      geminiApiKey: 'existing-key',
      onSaveGeminiApiKey,
    });

    fireEvent.click(screen.getByRole('button', {
      name: 'Xóa Gemini API key',
    }));

    await waitFor(() => {
      expect(onSaveGeminiApiKey).toHaveBeenCalledWith(null);
    });
    expect(screen.getByLabelText('Gemini API key')).toHaveValue('');
  });

  it('keeps the key editable when a save fails', async () => {
    const onSaveGeminiApiKey = vi.fn().mockResolvedValue(false);
    renderSettings({onSaveGeminiApiKey});
    const keyInput = screen.getByLabelText('Gemini API key');
    fireEvent.change(keyInput, {target: {value: 'retry-key'}});

    fireEvent.click(screen.getByRole('button', {
      name: 'Lưu Gemini API key',
    }));

    await waitFor(() => {
      expect(onSaveGeminiApiKey).toHaveBeenCalledWith('retry-key');
    });
    expect(keyInput).toHaveValue('retry-key');
    expect(keyInput).toBeEnabled();
  });
});
