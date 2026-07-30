import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AddWordModal} from './AddWordModal';

const PERSONAL_KEY = 'personal-gemini-key';

function renderModal(geminiApiKey: string | null) {
  render(
    <AddWordModal
      decks={[{
        id: 'deck-1',
        name: 'General',
        color: '#000000',
        createdAt: '2026-07-30',
      }]}
      tags={[]}
      globalWords={[]}
      linkedGlobalWords={[]}
      geminiApiKey={geminiApiKey}
      onAddWord={vi.fn().mockResolvedValue(true)}
      onLinkExistingGlobalWord={vi.fn().mockResolvedValue(true)}
      onClose={() => undefined}
    />,
  );
}

function geminiResponse() {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            word: 'transportation',
            ipa: '/ˌtrænspərˈteɪʃn/',
            partOfSpeech: 'noun',
            vietnameseMeaning: 'sự vận chuyển',
            wordStructure: [{
              text: 'transport',
              type: 'root',
              meaning: 'carry',
              order: 1,
            }],
            meanings: [{
              meaning: 'sự vận chuyển',
              partOfSpeech: 'noun',
              examples: [{
                sentence: 'Public transportation is convenient.',
                expectedAnswer: 'transportation',
                baseWord: 'transportation',
                wordForm: 'base',
                partOfSpeech: 'noun',
                difficulty: 'medium',
              }],
            }],
            wordFamily: ['transportation'],
          }),
        }],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    }],
    usageMetadata: {
      promptTokenCount: 20,
      candidatesTokenCount: 40,
      totalTokenCount: 60,
    },
    modelVersion: 'gemini-2.5-flash',
    responseId: 'response-1',
  }), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}

describe('AddWordModal Gemini Auto-Fill', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('does not make a request without a saved key and keeps manual entry available', async () => {
    renderModal(null);
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'transportation'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'AI Auto-Fill'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Gemini API key.*Cài đặt.*nhập thủ công/i,
    );
    expect(fetch).not.toHaveBeenCalled();

    const meaningInput = screen.getByPlaceholderText(
      'e.g. Giao thông vận tải',
    );
    fireEvent.change(meaningInput, {
      target: {value: 'tự nhập thủ công'},
    });
    expect(meaningInput).toHaveValue('tự nhập thủ công');
  });

  it('calls Gemini directly with the saved key and fills the form', async () => {
    vi.mocked(fetch).mockResolvedValue(geminiResponse());
    renderModal(PERSONAL_KEY);
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'transportation'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'AI Auto-Fill'}));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(
        'e.g. Giao thông vận tải',
      )).toHaveValue('sự vận chuyển');
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/generativelanguage\.googleapis\.com\//,
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': PERSONAL_KEY,
        }),
      }),
    );
  });

  it('shows quota feedback and preserves manual entry after Gemini rejects the request', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 429,
        message: 'Quota exceeded',
        status: 'RESOURCE_EXHAUSTED',
      },
    }), {
      status: 429,
      headers: {'Content-Type': 'application/json'},
    }));
    renderModal(PERSONAL_KEY);
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'transportation'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'AI Auto-Fill'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /hạn mức.*thử lại.*nhập thủ công/i,
    );
    const meaningInput = screen.getByPlaceholderText(
      'e.g. Giao thông vận tải',
    );
    fireEvent.change(meaningInput, {
      target: {value: 'nghĩa nhập tay'},
    });
    expect(meaningInput).toHaveValue('nghĩa nhập tay');
  });
});
