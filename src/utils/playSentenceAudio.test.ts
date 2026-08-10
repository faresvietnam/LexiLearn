import {afterEach, describe, expect, it, vi} from 'vitest';
import {playSentenceAudio} from './playSentenceAudio';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('playSentenceAudio', () => {
  it('plays the given audio URL and resolves when playback ends', async () => {
    const listeners: Record<string, () => void> = {};
    const play = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn((event: string, handler: () => void) => {
      listeners[event] = handler;
    });
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({play, addEventListener})));

    const promise = playSentenceAudio('The cat sleeps.', 'https://example.com/cat.mp3');
    expect(globalThis.Audio).toHaveBeenCalledWith('https://example.com/cat.mp3');
    expect(play).toHaveBeenCalledOnce();

    listeners.ended();
    await expect(promise).resolves.toBeUndefined();
  });

  it('falls back to browser speech synthesis and resolves when speech ends', async () => {
    const listeners: Record<string, () => void> = {};
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', {speak, cancel});
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({
        text,
        addEventListener: (event: string, handler: () => void) => {
          listeners[event] = handler;
        },
      })),
    );

    const promise = playSentenceAudio('The cat sleeps.');
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({text: 'The cat sleeps.'}));

    listeners.end();
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves immediately when neither an audio URL nor speech synthesis is available', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    await expect(playSentenceAudio('The cat sleeps.')).resolves.toBeUndefined();
  });
});
