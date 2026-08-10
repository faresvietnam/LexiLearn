export function playSentenceAudio(englishSentence: string, audioUrl?: string): void {
  if (audioUrl) {
    new Audio(audioUrl).play().catch(() => undefined);
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(englishSentence));
  }
}
