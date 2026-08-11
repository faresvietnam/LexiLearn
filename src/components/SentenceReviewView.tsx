import React, {useEffect, useRef, useState} from 'react';
import {BrainCircuit, Volume2} from 'lucide-react';
import {SentenceCard} from '../types';
import type {AutomaticRating} from '../features/scheduling/automaticRating';
import {
  deriveSentenceMemoryStrength,
  deriveSentenceRating,
  expectedTypingResponseTimeMs,
  expectedWordOrderResponseTimeMs,
} from '../features/scheduling/sentenceRating';
import {formatComeBackAt} from '../features/scheduling/relativeDueTime';
import {normalizeText} from '../utils/charDiff';
import {playSentenceAudio} from '../utils/playSentenceAudio';
import {CharacterDiffComparison} from './CharacterDiffComparison';
import {WordOrderQuestion} from './WordOrderQuestion';

interface SentenceReviewViewProps {
  sentenceCards: SentenceCard[];
  onSubmitReview: (cardId: string, rating: AutomaticRating) => Promise<SentenceCard | null>;
}

const REINSERT_OFFSET = 4;
const GRADUATED_STRENGTHS = new Set(['stable', 'strong']);

function pickPromptKind(): 'image' | 'vietnamese' {
  return Math.random() < 0.5 ? 'image' : 'vietnamese';
}

function wordCount(sentence: string): number {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

function isTextInputElement(target: EventTarget | null): boolean {
  const tagName = (target as HTMLElement | null)?.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA';
}

export const SentenceReviewView: React.FC<SentenceReviewViewProps> = ({
  sentenceCards,
  onSubmitReview,
}) => {
  const [queue, setQueue] = useState<SentenceCard[]>(() => sentenceCards
    .filter((card) => Date.parse(card.nextReviewDate) <= Date.now())
    .sort((a, b) => Date.parse(a.nextReviewDate) - Date.parse(b.nextReviewDate)));
  const [index, setIndex] = useState(0);
  const [promptKind, setPromptKind] = useState<'image' | 'vietnamese'>(pickPromptKind);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showWrongHint, setShowWrongHint] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showCorrectPause, setShowCorrectPause] = useState(false);
  const [pendingRating, setPendingRating] = useState<AutomaticRating | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTimeRef = useRef(performance.now());
  const submittingRef = useRef(false);

  const card = queue[index];
  const questionKind = card && card.fsrsState === 2 ? 'typing' : 'word_order';

  const advance = () => {
    setIndex((current) => current + 1);
    setPromptKind(pickPromptKind());
    setTypedAnswer('');
    setWrongAttempts(0);
    setShowWrongHint(false);
    setShowDiff(false);
    setShowCorrectPause(false);
    setPendingRating(null);
    startTimeRef.current = performance.now();
  };

  const submitAndAdvance = async (rating: AutomaticRating) => {
    if (!card || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const updatedCard = await onSubmitReview(card.id, rating);
      if (updatedCard && !GRADUATED_STRENGTHS.has(deriveSentenceMemoryStrength(updatedCard))) {
        setQueue((current) => {
          const next = [...current];
          next.splice(Math.min(index + REINSERT_OFFSET, next.length), 0, updatedCard);
          return next;
        });
      }
      advance();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!card || showDiff || showCorrectPause || isSubmitting) return;

    const isCorrect = normalizeText(typedAnswer) === normalizeText(card.englishSentence);
    if (isCorrect) {
      const responseTimeMs = performance.now() - startTimeRef.current;
      const rating = deriveSentenceRating({
        wrongAttemptsBeforeSuccess: wrongAttempts,
        responseTimeMs,
        expectedResponseTimeMs: expectedTypingResponseTimeMs(wordCount(card.englishSentence)),
      });
      setPendingRating(rating);
      setShowCorrectPause(true);
      void playSentenceAudio(card.englishSentence, card.audioUrl);
      return;
    }

    const nextWrongAttempts = wrongAttempts + 1;
    setWrongAttempts(nextWrongAttempts);
    if (nextWrongAttempts >= 3) {
      setShowDiff(true);
      void playSentenceAudio(card.englishSentence, card.audioUrl);
    } else {
      setShowWrongHint(true);
      setTypedAnswer('');
    }
  };

  const handleContinueAfterCorrect = () => {
    if (!pendingRating) return;
    void submitAndAdvance(pendingRating);
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

  useEffect(() => {
    if (questionKind !== 'typing') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (showCorrectPause || showDiff)) {
        event.preventDefault();
        if (showCorrectPause) handleContinueAfterCorrect();
        else handleContinueAfterDiff();
      } else if ((event.key === 'p' || event.key === 'P') && !isTextInputElement(event.target)) {
        event.preventDefault();
        if (card) void playSentenceAudio(card.englishSentence, card.audioUrl);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKind, showCorrectPause, showDiff, pendingRating, card]);

  if (!card) {
    const total = sentenceCards.length;
    const MIN_CARDS_FOR_SESSION = 5;
    const strengths = {strong: 0, stable: 0, weak: 0, critical: 0};
    sentenceCards.forEach((c) => { strengths[deriveSentenceMemoryStrength(c)] += 1; });

    let headline: string;
    if (total === 0) {
      headline = 'Chưa có câu nào.';
    } else if (total < MIN_CARDS_FOR_SESSION) {
      headline = `Cần thêm ít nhất ${MIN_CARDS_FOR_SESSION - total} câu nữa để đủ ${MIN_CARDS_FOR_SESSION} câu ôn tập.`;
    } else {
      const fifthSoonest = [...sentenceCards]
        .sort((a, b) => Date.parse(a.nextReviewDate) - Date.parse(b.nextReviewDate))[MIN_CARDS_FOR_SESSION - 1];
      headline = formatComeBackAt(new Date(fifthSoonest.nextReviewDate), new Date());
    }

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-slate-900">{headline}</h2>
          <p className="text-sm text-slate-500">Số câu đang có: {total}</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-600" />
              <span>Phân bố mức ghi nhớ (Memory Strength)</span>
            </h3>
            <span className="text-xs text-slate-500 font-medium">{total} câu</span>
          </div>

          <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            {total > 0 ? (
              <>
                <div title={`Strong: ${strengths.strong}`} style={{width: `${(strengths.strong / total) * 100}%`}} className="bg-emerald-500" />
                <div title={`Stable: ${strengths.stable}`} style={{width: `${(strengths.stable / total) * 100}%`}} className="bg-blue-500" />
                <div title={`Weak: ${strengths.weak}`} style={{width: `${(strengths.weak / total) * 100}%`}} className="bg-amber-500" />
                <div title={`Critical: ${strengths.critical}`} style={{width: `${(strengths.critical / total) * 100}%`}} className="bg-rose-500" />
              </>
            ) : (
              <div className="w-full text-center text-xs text-slate-400 py-1">Chưa có dữ liệu</div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Strong (&gt;80%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{strengths.strong}</div>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80">
              <div className="flex items-center gap-1.5 text-xs text-blue-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Stable (50-80%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{strengths.stable}</div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80">
              <div className="flex items-center gap-1.5 text-xs text-amber-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Weak (25-50%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{strengths.weak}</div>
            </div>
            <div className="p-3 rounded-2xl bg-rose-50/70 border border-rose-200/80">
              <div className="flex items-center gap-1.5 text-xs text-rose-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Critical (&lt;25%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{strengths.critical}</div>
            </div>
          </div>
        </div>
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
            audioUrl={card.audioUrl}
            distractorPool={sentenceCards
              .filter((other) => other.id !== card.id)
              .flatMap((other) => other.englishSentence.trim().split(/\s+/))}
            onResolve={handleWordOrderResolve}
          />
        ) : showCorrectPause ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-bold text-emerald-600">Chính xác!</p>
            <p className="text-lg font-semibold text-slate-900">{card.englishSentence}</p>
            <button
              type="button"
              onClick={handleContinueAfterCorrect}
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
            >
              Tiếp tục (Enter)
            </button>
            <p className="text-xs text-slate-400">Nhấn P để nghe lại</p>
          </div>
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
              Tiếp tục (Enter)
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
