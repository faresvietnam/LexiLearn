export function playSentenceAudio(englishSentence: string, audioUrl?: string): Promise<void> {
  if (audioUrl) {
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audio.addEventListener('ended', () => resolve(), {once: true});
      audio.addEventListener('error', () => resolve(), {once: true});
      audio.play().catch(() => resolve());
    });
  }

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(englishSentence);
      utterance.addEventListener('end', () => resolve(), {once: true});
      utterance.addEventListener('error', () => resolve(), {once: true});
      window.speechSynthesis.speak(utterance);
    });
  }

  return Promise.resolve();
}
