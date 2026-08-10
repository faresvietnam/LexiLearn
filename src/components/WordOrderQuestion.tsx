import React, {useEffect, useRef, useState} from 'react';
import {playSentenceAudio} from '../utils/playSentenceAudio';

interface WordOrderQuestionProps {
  sentence: string;
  audioUrl?: string;
  distractorPool?: string[];
  onResolve: (result: {isCorrect: boolean; wrongAttempts: number; responseTimeMs: number}) => void;
}

const MIN_DISTRACTORS = 3;
const MAX_DISTRACTORS = 5;

type Phase = 'answering' | 'correct' | 'revealed';

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function stripPunctuation(word: string): string {
  return word.replace(/^[,.]+|[,.]+$/g, '');
}

function pickDistractors(pool: string[], ownWords: string[]): string[] {
  const ownWordsLower = new Set(ownWords.map((word) => word.toLowerCase()));
  const seenLower = new Set<string>();
  const uniqueCandidates: string[] = [];
  for (const raw of pool) {
    const word = stripPunctuation(raw);
    const lower = word.toLowerCase();
    if (!word || ownWordsLower.has(lower) || seenLower.has(lower)) continue;
    seenLower.add(lower);
    uniqueCandidates.push(word);
  }
  const count = MIN_DISTRACTORS + Math.floor(Math.random() * (MAX_DISTRACTORS - MIN_DISTRACTORS + 1));
  return shuffle(uniqueCandidates).slice(0, count);
}

function isTextInputElement(target: EventTarget | null): boolean {
  const tagName = (target as HTMLElement | null)?.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA';
}

export const WordOrderQuestion: React.FC<WordOrderQuestionProps> = ({
  sentence,
  audioUrl,
  distractorPool = [],
  onResolve,
}) => {
  const tokensRef = useRef(sentence.trim().split(/\s+/).map(stripPunctuation));
  const tokens = tokensRef.current;
  const distractorsRef = useRef(pickDistractors(distractorPool, tokens));
  const [pool, setPool] = useState<string[]>(() => shuffle([...tokens, ...distractorsRef.current]));
  const [answer, setAnswer] = useState<string[]>([]);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showWrongHint, setShowWrongHint] = useState(false);
  const [phase, setPhase] = useState<Phase>('answering');
  const startTimeRef = useRef(performance.now());
  const resolvedResponseTimeRef = useRef(0);

  const moveToAnswer = (poolIndex: number) => {
    setShowWrongHint(false);
    setAnswer((current) => [...current, pool[poolIndex]]);
    setPool((current) => current.filter((_, i) => i !== poolIndex));
  };

  const moveToPool = (answerIndex: number) => {
    setShowWrongHint(false);
    setPool((current) => [...current, answer[answerIndex]]);
    setAnswer((current) => current.filter((_, i) => i !== answerIndex));
  };

  const handleCheck = () => {
    if (phase !== 'answering') return;

    const isCorrect = answer.length === tokens.length
      && answer.every((word, i) => word.toLowerCase() === tokens[i].toLowerCase());
    resolvedResponseTimeRef.current = performance.now() - startTimeRef.current;

    if (isCorrect) {
      setPhase('correct');
      void playSentenceAudio(sentence, audioUrl);
      return;
    }

    const nextWrongAttempts = wrongAttempts + 1;
    setWrongAttempts(nextWrongAttempts);
    if (nextWrongAttempts >= 3) {
      setPhase('revealed');
      void playSentenceAudio(sentence, audioUrl);
    } else {
      setShowWrongHint(true);
    }
  };

  const handleContinue = () => {
    if (phase === 'correct') {
      onResolve({isCorrect: true, wrongAttempts, responseTimeMs: resolvedResponseTimeRef.current});
    } else if (phase === 'revealed') {
      onResolve({isCorrect: false, wrongAttempts: 2, responseTimeMs: resolvedResponseTimeRef.current});
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && phase !== 'answering') {
        event.preventDefault();
        handleContinue();
      } else if ((event.key === 'p' || event.key === 'P') && !isTextInputElement(event.target)) {
        event.preventDefault();
        void playSentenceAudio(sentence, audioUrl);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'revealed') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 text-center">Đáp án đúng:</p>
        <p className="text-lg font-semibold text-slate-900 text-center">{sentence}</p>
        <button
          type="button"
          onClick={handleContinue}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
        >
          Tiếp tục (Enter)
        </button>
        <p className="text-xs text-slate-400 text-center">Nhấn P để nghe lại</p>
      </div>
    );
  }

  if (phase === 'correct') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-bold text-emerald-600">Chính xác!</p>
        <div className="flex flex-wrap justify-center gap-2">
          {tokens.map((word, i) => (
            <span
              key={`correct-${i}`}
              className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold"
            >
              {word}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={handleContinue}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
        >
          Tiếp tục (Enter)
        </button>
        <p className="text-xs text-slate-400">Nhấn P để nghe lại</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="text-xs font-bold text-slate-700">Sắp xếp thành câu tiếng Anh</label>
      <div className="min-h-14 flex flex-wrap gap-2 p-3 border-2 border-indigo-200 rounded-xl bg-indigo-50/40">
        {answer.map((word, i) => (
          <button
            key={`answer-${i}`}
            type="button"
            onClick={() => moveToPool(i)}
            className="px-3 py-2 rounded-lg bg-white border border-indigo-300 text-slate-900 font-semibold shadow-sm"
          >
            {word}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">Chọn từng từ để xếp thành câu</p>
      <div className="flex flex-wrap justify-center gap-2">
        {pool.map((word, i) => (
          <button
            key={`pool-${i}`}
            type="button"
            onClick={() => moveToAnswer(i)}
            className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 font-semibold hover:bg-slate-200 transition"
          >
            {word}
          </button>
        ))}
      </div>

      {showWrongHint && (
        <p role="alert" className="text-sm text-rose-700">Sai rồi, thử lại.</p>
      )}

      <button
        type="button"
        onClick={handleCheck}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
      >
        Kiểm tra
      </button>
    </div>
  );
};
