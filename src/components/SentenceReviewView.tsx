import React, {useRef, useState} from 'react';
import {Volume2} from 'lucide-react';
import {SentenceCard} from '../types';
import type {AutomaticRating} from '../features/scheduling/automaticRating';
import {
  deriveSentenceRating,
  expectedTypingResponseTimeMs,
  expectedWordOrderResponseTimeMs,
} from '../features/scheduling/sentenceRating';
import {normalizeText} from '../utils/charDiff';
import {playSentenceAudio} from '../utils/playSentenceAudio';
import {CharacterDiffComparison} from './CharacterDiffComparison';
import {WordOrderQuestion} from './WordOrderQuestion';

interface SentenceReviewViewProps {
  sentenceCards: SentenceCard[];
  onSubmitReview: (cardId: string, rating: AutomaticRating) => Promise<boolean>;
}

function pickPromptKind(): 'image' | 'vietnamese' {
  return Math.random() < 0.5 ? 'image' : 'vietnamese';
}

function wordCount(sentence: string): number {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

export const SentenceReviewView: React.FC<SentenceReviewViewProps> = ({
  sentenceCards,
  onSubmitReview,
}) => {
  const [queue] = useState(() => sentenceCards
    .filter((card) => Date.parse(card.nextReviewDate) <= Date.now())
    .sort((a, b) => Date.parse(a.nextReviewDate) - Date.parse(b.nextReviewDate)));
  const [index, setIndex] = useState(0);
  const [promptKind, setPromptKind] = useState<'image' | 'vietnamese'>(pickPromptKind);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showWrongHint, setShowWrongHint] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTimeRef = useRef(performance.now());

  const card = queue[index];
  const questionKind = card && card.fsrsState === 2 ? 'typing' : 'word_order';

  const advance = () => {
    setIndex((current) => current + 1);
    setPromptKind(pickPromptKind());
    setTypedAnswer('');
    setWrongAttempts(0);
    setShowWrongHint(false);
    setShowDiff(false);
    startTimeRef.current = performance.now();
  };

  const submitAndAdvance = async (rating: AutomaticRating) => {
    if (!card) return;
    setIsSubmitting(true);
    try {
      await onSubmitReview(card.id, rating);
      advance();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!card || showDiff || isSubmitting) return;

    const isCorrect = normalizeText(typedAnswer) === normalizeText(card.englishSentence);
    if (isCorrect) {
      const responseTimeMs = performance.now() - startTimeRef.current;
      await submitAndAdvance(deriveSentenceRating({
        wrongAttemptsBeforeSuccess: wrongAttempts,
        responseTimeMs,
        expectedResponseTimeMs: expectedTypingResponseTimeMs(wordCount(card.englishSentence)),
      }));
      return;
    }

    const nextWrongAttempts = wrongAttempts + 1;
    setWrongAttempts(nextWrongAttempts);
    if (nextWrongAttempts >= 3) {
      setShowDiff(true);
    } else {
      setShowWrongHint(true);
      setTypedAnswer('');
    }
  };

  const handleContinueAfterDiff = () => void submitAndAdvance('Again');

  const handleWordOrderResolve = (result: {isCorrect: boolean; wrongAttempts: number; responseTimeMs: number}) => {
    if (!card) return;
    const rating = result.isCorrect
      ? deriveSentenceRating({
          wrongAttemptsBeforeSuccess: result.wrongAttempts,
          responseTimeMs: result.responseTimeMs,
          expectedResponseTimeMs: expectedWordOrderResponseTimeMs(wordCount(card.englishSentence)),
        })
      : 'Again';
    void submitAndAdvance(rating);
  };

  if (!card) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-2">
        <h2 className="text-xl font-bold text-slate-900">Không còn câu nào cần ôn tập.</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Câu {index + 1} / {queue.length}
      </p>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
        {promptKind === 'image' ? (
          <img
            src={card.imageUrl}
            alt="Gợi ý"
            className="w-full max-h-64 rounded-2xl object-contain bg-slate-50"
          />
        ) : (
          <p className="text-xl font-semibold text-slate-900 text-center">
            {card.vietnameseSentence}
          </p>
        )}

        {questionKind === 'word_order' ? (
          <WordOrderQuestion
            key={card.id}
            sentence={card.englishSentence}
            onResolve={handleWordOrderResolve}
          />
        ) : showDiff ? (
          <div className="space-y-4">
            <CharacterDiffComparison userInput={typedAnswer} expectedInput={card.englishSentence} />
            {card.ipa && (
              <p className="text-sm text-indigo-600 font-mono text-center">{card.ipa}</p>
            )}
            <button
              type="button"
              onClick={() => playSentenceAudio(card.englishSentence, card.audioUrl)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition"
            >
              <Volume2 className="w-4 h-4" /> Nghe câu
            </button>
            <button
              type="button"
              onClick={handleContinueAfterDiff}
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
            >
              Tiếp tục
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
            <label htmlFor="sentence-answer" className="text-xs font-bold text-slate-700">
              Viết lại câu tiếng Anh
            </label>
            <input
              id="sentence-answer"
              type="text"
              value={typedAnswer}
              onChange={(event) => {
                setTypedAnswer(event.target.value);
                setShowWrongHint(false);
              }}
              autoFocus
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
            {showWrongHint && (
              <p role="alert" className="text-sm text-rose-700">Sai rồi, thử lại.</p>
            )}
            <button
              type="submit"
              disabled={!typedAnswer.trim() || isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
            >
              Kiểm tra
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
