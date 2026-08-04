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
import type {UserSettings} from '../types';

const PERSONAL_KEY = 'personal-gemini-key';

function renderModal(
  geminiApiKey: string | null,
  aiSettings?: Pick<
    UserSettings,
    | 'aiProvider'
    | 'geminiApiKey'
    | 'openAICompatibleBaseUrl'
    | 'openAICompatibleToken'
    | 'openAICompatibleModel'
  >,
) {
  const onAddWord = vi.fn().mockResolvedValue(true);
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
      {...(aiSettings ? {aiSettings} : {})}
      onAddWord={onAddWord}
      onLinkExistingGlobalWord={vi.fn().mockResolvedValue(true)}
      onClose={() => undefined}
    />,
  );
  return onAddWord;
}

async function openAIResponse() {
  const geminiPayload = await geminiResponse().json() as {
    candidates: Array<{content: {parts: Array<{text: string}>}}>;
  };
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    choices: [{
      index: 0,
      message: {
        content: geminiPayload.candidates[0].content.parts[0].text,
        role: 'assistant',
        reasoning_content: null,
      },
      finish_reason: 'stop',
      logprobs: null,
    }],
    model: 'deepseek-ai/deepseek-v4-flash',
    object: 'chat.completion',
  }), {status: 200});
}

function geminiResponse({
  word = 'transportation',
  canonicalWord = word,
}: {
  word?: string;
  canonicalWord?: string;
} = {}) {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            word,
            canonicalWord,
            ipa: '/ˌtrænspərˈteɪʃn/',
            partOfSpeech: 'noun',
            vietnameseMeaning: 'sự vận chuyển',
            wordStructure: [{
              text: 'transport',
              type: 'root',
              meaningVi: 'vận chuyển',
              order: 1,
            }, {
              text: 'ation',
              type: 'suffix',
              meaningVi: 'hành động hoặc quá trình',
              order: 2,
            }],
            meanings: [{
              meaningVi: 'sự vận chuyển',
              definitionEn: 'the movement of people or goods from one place to another',
              partOfSpeech: 'noun',
              examples: [{
                sentence: `${canonicalWord} appears in the first example.`,
                expectedAnswer: canonicalWord,
                baseWord: canonicalWord,
                wordForm: 'base',
                partOfSpeech: 'noun',
                difficulty: 'medium',
              }, {
                sentence: `${canonicalWord} appears in the second example.`,
                expectedAnswer: canonicalWord,
                baseWord: canonicalWord,
                wordForm: 'base',
                partOfSpeech: 'noun',
                difficulty: 'medium',
              }, {
                sentence: `${canonicalWord} appears in the third example.`,
                expectedAnswer: canonicalWord,
                baseWord: canonicalWord,
                wordForm: 'base',
                partOfSpeech: 'noun',
                difficulty: 'medium',
              }],
            }],
            wordFamily: [canonicalWord],
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
    modelVersion: 'gemini-flash-latest',
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
    expect(screen.getByLabelText('Định nghĩa tiếng Anh 1')).toHaveValue(
      'the movement of people or goods from one place to another',
    );
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

  it('updates the visible word to the canonical headword after AI Auto-Fill', async () => {
    vi.mocked(fetch).mockResolvedValue(geminiResponse({
      word: 'abandoned',
      canonicalWord: 'abandon',
    }));
    renderModal(PERSONAL_KEY);
    const wordInput = screen.getByPlaceholderText('e.g. transportation');
    fireEvent.change(wordInput, {target: {value: 'abandoned'}});

    fireEvent.click(screen.getByRole('button', {name: 'AI Auto-Fill'}));

    await waitFor(() => expect(wordInput).toHaveValue('abandon'));
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

  it('analyzes and saves every batch word sequentially without a frontend cap', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(geminiResponse()));
    const onAddWord = renderModal(PERSONAL_KEY);
    fireEvent.change(screen.getByLabelText('AI thêm nhiều từ'), {
      target: {value: 'transportation\nsuccessful, transportation'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'AI thêm danh sách'}));

    await waitFor(() => expect(onAddWord).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Đã thêm 2/2 từ');
  });

  it('saves the canonical headword returned for a batch AI entry', async () => {
    vi.mocked(fetch).mockResolvedValue(geminiResponse({
      word: 'children',
      canonicalWord: 'child',
    }));
    const onAddWord = renderModal(PERSONAL_KEY);
    fireEvent.change(screen.getByLabelText('AI thêm nhiều từ'), {
      target: {value: 'children'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'AI thêm danh sách'}));

    await waitFor(() => expect(onAddWord).toHaveBeenCalledOnce());
    expect(onAddWord.mock.calls[0][0].word).toBe('child');
  });
});

describe('AddWordModal OpenAI-compatible Auto-Fill', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses the selected compatible endpoint and fills the form', async () => {
    vi.mocked(fetch).mockResolvedValue(await openAIResponse());
    renderModal(null, {
      aiProvider: 'openai-compatible',
      geminiApiKey: 'unused-gemini-key',
      openAICompatibleBaseUrl: 'https://integrate.8686.vn/v1',
      openAICompatibleToken: 'compat-token',
      openAICompatibleModel: 'deepseek-ai/deepseek-v4-flash',
    });
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
      'https://integrate.8686.vn/v1/chat/completions',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer compat-token',
          'Content-Type': 'application/json',
        },
      }),
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      model: 'deepseek-ai/deepseek-v4-flash',
      response_format: {type: 'json_object'},
    });
    expect(JSON.stringify(vi.mocked(fetch).mock.calls[0]))
      .not.toContain('unused-gemini-key');
  });
});

describe('AddWordModal meaning editor', () => {
  afterEach(cleanup);

  it('submits ordered meanings with independent types, definitions, and examples', async () => {
    const onAddWord = renderModal(null);
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'compose'},
    });
    fireEvent.change(screen.getByLabelText('Nghĩa tiếng Việt 1'), {
      target: {value: 'soạn, sáng tác'},
    });
    fireEvent.change(screen.getByLabelText('Từ loại 1'), {
      target: {value: 'verb'},
    });
    fireEvent.change(screen.getByLabelText('Định nghĩa tiếng Anh 1'), {
      target: {value: 'to create a written or musical work'},
    });
    fireEvent.change(screen.getByLabelText('Câu ví dụ 1.1'), {
      target: {value: 'She composed a short song.'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'Thêm nghĩa'}));
    fireEvent.change(screen.getByLabelText('Nghĩa tiếng Việt 2'), {
      target: {value: 'giữ bình tĩnh'},
    });
    fireEvent.change(screen.getByLabelText('Từ loại 2'), {
      target: {value: 'adjective'},
    });
    fireEvent.change(screen.getByLabelText('Định nghĩa tiếng Anh 2'), {
      target: {value: 'calm and in control'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    await waitFor(() => expect(onAddWord).toHaveBeenCalledOnce());
    const savedWord = onAddWord.mock.calls[0][0];
    expect(savedWord).not.toHaveProperty('ipa');
    expect(savedWord.meanings).toMatchObject([
      {
        meaning: 'soạn, sáng tác',
        partOfSpeech: 'verb',
        definitionEn: 'to create a written or musical work',
        exampleSentences: [{
          sentence: 'She composed a short song.',
        }],
      },
      {
        meaning: 'giữ bình tĩnh',
        partOfSpeech: 'adjective',
        definitionEn: 'calm and in control',
        exampleSentences: [],
      },
    ]);
  });

  it('preserves an inflected word when the user saves without AI', async () => {
    const onAddWord = renderModal(null);
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'abandoned'},
    });
    fireEvent.change(screen.getByLabelText('Nghĩa tiếng Việt 1'), {
      target: {value: 'đã bỏ rơi'},
    });

    fireEvent.click(screen.getByRole('button', {name: 'Lưu từ vựng'}));

    await waitFor(() => expect(onAddWord).toHaveBeenCalledOnce());
    expect(onAddWord.mock.calls[0][0].word).toBe('abandoned');
  });

  it('does not submit while any meaning is incomplete', async () => {
    const onAddWord = renderModal(null);
    fireEvent.change(screen.getByPlaceholderText('e.g. transportation'), {
      target: {value: 'compose'},
    });
    fireEvent.change(screen.getByLabelText('Nghĩa tiếng Việt 1'), {
      target: {value: 'soạn'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Thêm nghĩa'}));

    fireEvent.submit(screen.getByRole('button', {name: 'Lưu từ vựng'}).closest('form')!);

    await waitFor(() => expect(onAddWord).not.toHaveBeenCalled());
  });

  it('keeps one meaning section and removes only the selected extra meaning', () => {
    renderModal(null);
    expect(screen.getByRole('button', {name: 'Xóa nghĩa 1'})).toBeDisabled();

    fireEvent.click(screen.getByRole('button', {name: 'Thêm nghĩa'}));
    fireEvent.change(screen.getByLabelText('Nghĩa tiếng Việt 2'), {
      target: {value: 'nghĩa sẽ xóa'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Xóa nghĩa 2'}));

    expect(screen.queryByDisplayValue('nghĩa sẽ xóa')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Xóa nghĩa 1'})).toBeDisabled();
  });
});
