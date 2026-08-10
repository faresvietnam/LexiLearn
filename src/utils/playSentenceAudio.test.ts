import {afterEach, describe, expect, it, vi} from 'vitest';
import {playSentenceAudio} from './playSentenceAudio';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('playSentenceAudio', () => {
  it('plays the given audio URL when present', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({play})));

    playSentenceAudio('The cat sleeps.', 'https://example.com/cat.mp3');

    expect(globalThis.Audio).toHaveBeenCalledWith('https://example.com/cat.mp3');
    expect(play).toHaveBeenCalledOnce();
  });

  it('falls back to browser speech synthesis when no audio URL is given', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', {speak, cancel});
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({text})),
    );

    playSentenceAudio('The cat sleeps.');

    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({text: 'The cat sleeps.'}));
  });
});
