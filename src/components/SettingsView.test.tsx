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
import type {AiProviderSettings} from '../features/persistence/settingsRepository';

afterEach(cleanup);

function renderSettings({
  geminiApiKey = null,
  onSaveGeminiApiKey = vi.fn().mockResolvedValue(true),
  onSaveAiProviderSettings,
}: {
  geminiApiKey?: string | null;
  onSaveGeminiApiKey?: (apiKey: string | null) => Promise<boolean>;
  onSaveAiProviderSettings?: (
    settings: AiProviderSettings,
  ) => Promise<boolean>;
} = {}) {
  render(
    <SettingsView
      settings={{...INITIAL_SETTINGS, geminiApiKey}}
      studyScope={INITIAL_STUDY_SCOPE}
      words={[]}
      onUpdateSettings={vi.fn().mockResolvedValue(true)}
      onSaveGeminiApiKey={onSaveGeminiApiKey}
      {...(onSaveAiProviderSettings
        ? {onSaveAiProviderSettings}
        : {})}
      onExportData={() => undefined}
    />,
  );
}

describe('SettingsView personal Gemini key', () => {
  it('explains how to get a key and saves a trimmed key without displaying it as text', async () => {
    const onSaveGeminiApiKey = vi.fn().mockResolvedValue(true);
    renderSettings({onSaveGeminiApiKey});

    expect(screen.getByText(/Cách lấy Gemini API key/i)).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /Google AI Studio/i})).toHaveAttribute(
      'href',
      'https://aistudio.google.com/apikey',
    );
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

describe('SettingsView OpenAI-compatible provider', () => {
  it('normalizes and saves base URL, token, and model', async () => {
    const onSaveAiProviderSettings = vi.fn().mockResolvedValue(true);
    renderSettings({onSaveAiProviderSettings});

    fireEvent.change(screen.getByLabelText('Nhà cung cấp AI'), {
      target: {value: 'openai-compatible'},
    });
    expect(screen.getByLabelText('Base URL')).toHaveAttribute(
      'placeholder',
      'https://openai.com/v1',
    );
    expect(screen.getByLabelText('Model')).toHaveAttribute(
      'placeholder',
      'gpt5.5',
    );
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: {value: ' https://integrate.8686.vn/v1/ '},
    });
    fireEvent.change(screen.getByLabelText('Token'), {
      target: {value: ' compat-token '},
    });
    fireEvent.change(screen.getByLabelText('Model'), {
      target: {value: ' deepseek-ai/deepseek-v4-flash '},
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Lưu cấu hình OpenAI-compatible',
    }));

    await waitFor(() => {
      expect(onSaveAiProviderSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          aiProvider: 'openai-compatible',
          openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
          openAICompatibleToken: 'compat-token',
          openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
        }),
      );
    });
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
  });

  it('rejects a non-HTTPS compatible base URL before saving', async () => {
    const onSaveAiProviderSettings = vi.fn().mockResolvedValue(true);
    renderSettings({onSaveAiProviderSettings});
    fireEvent.change(screen.getByLabelText('Nhà cung cấp AI'), {
      target: {value: 'openai-compatible'},
    });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: {value: 'http://localhost:11434/v1'},
    });
    fireEvent.change(screen.getByLabelText('Token'), {
      target: {value: 'token'},
    });
    fireEvent.change(screen.getByLabelText('Model'), {
      target: {value: 'model'},
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'Lưu cấu hình OpenAI-compatible',
    }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTPS/i);
    expect(onSaveAiProviderSettings).not.toHaveBeenCalled();
  });
});
