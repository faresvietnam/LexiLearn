import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  HelpCircle,
  X,
  Check,
  RotateCcw,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Keyboard,
  Eye,
  CornerDownLeft,
} from 'lucide-react';
import {
  MeaningCard,
  Question,
  QuestionType,
  UserSettings,
  SessionStats,
  StudyAttemptInput,
  StudyInputMode,
  WordPart,
} from '../types';
import { computeCharDiff, DiffResult, normalizeText } from '../utils/charDiff';
import { recordAttemptAnalytics } from '../utils/srs';
import {
  deriveAutomaticRating,
  type AutomaticRating,
} from '../features/scheduling/automaticRating';
import type {ScheduledLearningCard} from '../features/scheduling/fsrsScheduler';
import type {SkillScoreInput} from '../features/scheduling/skillScores';
import {formatRelativeDueTime} from '../features/scheduling/relativeDueTime';

function maskSentenceAnswer(sentence: string, answer: string): string {
  if (/_{3,}/.test(sentence)) return sentence;
  const escapedAnswer = answer.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escapedAnswer) return sentence;
  return sentence.replace(
    new RegExp(`\\b${escapedAnswer}\\b`, 'i'),
    '_____ ',
  ).replace(/_____\s+([,.!?;:])/g, '_____$1').trim();
}
const TYPED_ANSWER_QUESTION_TYPES: readonly QuestionType[] = [
  'full_word_typing',
  'word_part_typing',
  'sentence_completion',
  'image_question',
  'audio_question',
];

function isTypingQuestionType(type: QuestionType): boolean {
  return TYPED_ANSWER_QUESTION_TYPES.includes(type);
}

import { CharacterDiffComparison } from './CharacterDiffComparison';

interface LearningSessionViewProps {
  questions: Question[];
  settings: UserSettings;
  isExtraReview: boolean;
  onMeaningCardUpdated: (
    wordId: string,
    meaningCardId: string,
    updatedCard: MeaningCard
  ) => void;
  onAttempt: (attempt: StudyAttemptInput) => void | Promise<void>;
  onReviewCompleted?: (
    learningCardId: string,
    rating: AutomaticRating,
    reviewedAt: Date,
    skillInput?: SkillScoreInput,
  ) => Promise<ScheduledLearningCard | null>;
  onFinishSession: (stats: SessionStats) => void;
  onExitSession: () => void;
}

export const LearningSessionView: React.FC<LearningSessionViewProps> = ({
  questions,
  settings,
  isExtraReview,
  onMeaningCardUpdated,
  onAttempt,
  onReviewCompleted,
  onFinishSession,
  onExitSession,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion = questions[currentIndex];

  // User input states
  const [selectedMcOption, setSelectedMcOption] = useState<string | null>(null);
  const [selectedParts, setSelectedParts] = useState<WordPart[]>([]);
  const [typingValue, setTypingValue] = useState<string>('');
  const [partTypingValues, setPartTypingValues] = useState<{ [partId: string]: string }>({});

  // Question resolution states
  const [isChecked, setIsChecked] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [attemptsCount, setAttemptsCount] = useState<number>(0);
  const [hintLevel, setHintLevel] = useState<number>(0);
  const [showHintModal, setShowHintModal] = useState<boolean>(false);
  const [showPauseMenu, setShowPauseMenu] = useState<boolean>(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [accumulatedErrorTypes, setAccumulatedErrorTypes] = useState<string[]>([]);
  const [showAnswerReview, setShowAnswerReview] = useState<boolean>(false);
  const [reviewSchedule, setReviewSchedule] =
    useState<ScheduledLearningCard | null>(null);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [reviewSaveError, setReviewSaveError] = useState(false);

  // Question timing & stats
  const sessionStartTimeRef = useRef<number>(Date.now());
  const questionStartTimeRef = useRef<number>(Date.now());
  const retriesTotalRef = useRef<number>(0);
  const firstAttemptSuccessesRef = useRef<number>(0);
  const totalAttemptedQuestionsRef = useRef<number>(0);
  const reviewRequestIdRef = useRef(0);
  const reviewRetryRef = useRef<(() => void) | null>(null);

  // Focus ref for input
  const inputRef = useRef<HTMLInputElement>(null);

  const getInputMode = (question: Question): StudyInputMode => {
    if (
      question.type === 'en_to_vn_mc'
      || question.type === 'vn_to_en_mc'
    ) {
      return 'multiple_choice';
    }
    if (
      question.type === 'word_part_selection'
      || question.type === 'word_part_typing'
    ) {
      return 'word_parts';
    }
    if (question.type === 'image_question') return 'image';
    if (question.type === 'audio_question') return 'audio';
    return 'typing';
  };

  useEffect(() => {
    questionStartTimeRef.current = Date.now();
    resetQuestionState();
  }, [currentIndex]);

  const resetQuestionState = () => {
    setSelectedMcOption(null);
    setSelectedParts([]);
    setTypingValue('');
    setPartTypingValues({});
    setIsChecked(false);
    setIsCorrect(false);
    setAttemptsCount(0);
    setHintLevel(0);
    setShowHintModal(false);
    setDiffResult(null);
    setAccumulatedErrorTypes([]);
    setShowAnswerReview(false);
    setReviewSchedule(null);
    setIsReviewSaving(false);
    setReviewSaveError(false);
    reviewRequestIdRef.current += 1;
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Play audio pronunciation using Web Speech API synthesis or mock audio
  const handlePlayAudio = () => {
    if (!currentQuestion) return;
    if (currentQuestion.word.audioUrl) {
      const audio = new Audio(currentQuestion.word.audioUrl);
      void audio.play().catch(() => undefined);
      return;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentQuestion.word.word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // Check Answer Handler
  const handleCheckAnswer = () => {
    if (!currentQuestion) return;

    const newAttempts = attemptsCount + 1;
    setAttemptsCount(newAttempts);

    let correct = false;
    let expected = currentQuestion.expectedAnswer;
    let userVal = '';

    if (currentQuestion.type === 'en_to_vn_mc' || currentQuestion.type === 'vn_to_en_mc') {
      const selectedOpt = currentQuestion.mcOptions?.find((o) => o.id === selectedMcOption);
      userVal = selectedOpt?.label ?? '';
      correct = selectedOpt?.isCorrect || false;
    } else if (currentQuestion.type === 'word_part_selection') {
      if ((currentQuestion.wordParts?.length ?? 0) === 0) {
        userVal = typingValue;
        correct = typingValue.trim().toLowerCase() === expected.toLowerCase();
      } else {
        userVal = selectedParts.map((p) => p.text).join('');
        correct = userVal.toLowerCase() === expected.toLowerCase();
      }
    } else if (currentQuestion.type === 'word_part_typing') {
      const parts = currentQuestion.wordParts || [];
      const typedFull = parts.map((p) => partTypingValues[p.id] || '').join('');
      userVal = typedFull;
      correct = normalizeText(typedFull) === normalizeText(expected);
    } else {
      userVal = typingValue;
      correct = typingValue.trim().toLowerCase() === expected.toLowerCase();
    }

    let currentDiff: DiffResult | null = null;

    // Compute diff for typing questions
    if (
      currentQuestion.type === 'full_word_typing' ||
      currentQuestion.type === 'word_part_typing' ||
      currentQuestion.type === 'sentence_completion'
    ) {
      currentDiff = computeCharDiff(userVal, expected);
      setDiffResult(currentDiff);
    }

    setIsChecked(true);
    setIsCorrect(correct);

    const responseTimeMs = Date.now() - questionStartTimeRef.current;
    const attemptErrorTypes = currentDiff?.errorTypes ?? [];
    try {
      void Promise.resolve(onAttempt({
        learningCardId: currentQuestion.targetMeaningCard.id,
        questionType: currentQuestion.type,
        inputMode: getInputMode(currentQuestion),
        attemptNumber: newAttempts,
        submittedAnswer: userVal,
        isCorrect: correct,
        firstAttempt: newAttempts === 1,
        responseTimeMs,
        hintLevel,
        answerRevealed: hintLevel >= 5,
              errorTypes: attemptErrorTypes,
              sentenceKey: currentQuestion.exampleSentence?.id,
      })).catch(() => undefined);
    } catch {
      // Persistence never interrupts the in-memory learning flow.
    }

    if (correct) {
      // First attempt recording
      const isFirstTry = newAttempts === 1;
      if (isFirstTry) {
        firstAttemptSuccessesRef.current += 1;
      }
      totalAttemptedQuestionsRef.current += 1;

      // Keep analytics/history separate from FSRS scheduling. FSRS owns all
      // memory and due-date fields after the scheduler callback resolves.
      const analyticsCard = recordAttemptAnalytics(
        currentQuestion.targetMeaningCard,
        currentQuestion.stage,
        isFirstTry,
        newAttempts,
        hintLevel,
        responseTimeMs,
        accumulatedErrorTypes,
      );
      onMeaningCardUpdated(
        currentQuestion.word.id,
        currentQuestion.targetMeaningCard.id,
        analyticsCard,
      );

      // Transition to Answer Review Overlay
      setShowAnswerReview(true);

      if (onReviewCompleted) {
        const reviewedAt = new Date();
        const rating = deriveAutomaticRating({
          questionType: currentQuestion.type,
          isFirstAttemptCorrect: isFirstTry,
          attemptsCount: newAttempts,
          hintLevelUsed: hintLevel,
          answerRevealed: hintLevel >= 5,
          responseTimeMs,
          expectedAnswerLength: currentQuestion.expectedAnswer.length,
        });
        const requestId = ++reviewRequestIdRef.current;

        const saveReview = () => {
          setIsReviewSaving(true);
          setReviewSaveError(false);
          try {
            void Promise.resolve(onReviewCompleted(
              currentQuestion.targetMeaningCard.id,
              rating,
              reviewedAt,
              {
                questionType: currentQuestion.type,
                isCorrect: correct,
                firstAttempt: isFirstTry,
                responseTimeMs,
                hintLevel,
                answerRevealed: hintLevel >= 5,
                errorTypes: accumulatedErrorTypes,
              },
            )).then((schedule) => {
              if (reviewRequestIdRef.current !== requestId) return;
              setReviewSchedule(schedule);
              setIsReviewSaving(false);
              setReviewSaveError(!schedule);
            }).catch(() => {
              setIsReviewSaving(false);
              setReviewSaveError(true);
            });
          } catch {
            setIsReviewSaving(false);
            setReviewSaveError(true);
          }
        };
        saveReview();
        reviewRetryRef.current = saveReview;
      }

      // Autoplay audio if enabled
      if (settings.audioAutoplay) {
        handlePlayAudio();
      }
    } else {
      // Wrong answer behavior
      retriesTotalRef.current += 1;
      if (attemptErrorTypes.length > 0) {
        setAccumulatedErrorTypes((prev) => [...prev, ...attemptErrorTypes]);
      }

      // Auto increase hint level on repeated attempts
      if (newAttempts >= 2 && hintLevel < 1) {
        setHintLevel(1);
      } else if (newAttempts >= 3 && hintLevel < 2) {
        setHintLevel(2);
      }
    }
  };

  // Continue to Next Question
  const handleContinueNext = () => {
    if (onReviewCompleted && (isReviewSaving || !reviewSchedule)) return;
    setShowAnswerReview(false);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Finish Session
      const accuracy =
        totalAttemptedQuestionsRef.current > 0
          ? Math.round(
              (firstAttemptSuccessesRef.current / totalAttemptedQuestionsRef.current) * 100
            )
          : 100;

      onFinishSession({
        reviewsCompleted: questions.length,
        newWordsLearned: questions.filter((q) => q.targetMeaningCard.fsrsState === 0).length,
        firstAttemptAccuracy: accuracy,
        studyTimeSeconds: Math.round((Date.now() - sessionStartTimeRef.current) / 1000),
        retriesTotal: retriesTotalRef.current,
        extraReviewMode: isExtraReview,
      });
    }
  };

  // Keyboard Navigation Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable === true;

      // Typing owns the keyboard while an answer field is focused. Enter is
      // intentionally kept as the check/continue action; every other session
      // shortcut must pass through to the input unchanged.
      if (isEditableTarget && e.key !== 'Enter') return;

      // Escape for Pause Menu
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPauseMenu((prev) => !prev);
        return;
      }

      if (showPauseMenu) return;

      // Enter key: Check or Continue
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showAnswerReview) {
          handleContinueNext();
        } else if (!isChecked) {
          handleCheckAnswer();
        } else if (!isCorrect) {
          // Retry typing attempt
          setIsChecked(false);
          setDiffResult(null);
          if (currentQuestion && isTypingQuestionType(currentQuestion.type)) {
            setTypingValue('');
            setPartTypingValues({});
          }
          inputRef.current?.focus();
        }
        return;
      }

      // 'H' key for Hint
      if ((e.key === 'h' || e.key === 'H') && !isChecked) {
        if (isEditableTarget) return;
        e.preventDefault();
        setShowHintModal((prev) => !prev);
        setHintLevel((prev) => Math.min(5, prev + 1));
        return;
      }

      // 'P' key for Audio
      if (e.key === 'p' || e.key === 'P') {
        if (isEditableTarget) return;
        e.preventDefault();
        handlePlayAudio();
        return;
      }

      // Number keys 1-9 for MC selection
      if (!isChecked && currentQuestion?.mcOptions && ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        const optionIndex = parseInt(e.key) - 1;
        if (currentQuestion.mcOptions[optionIndex]) {
          setSelectedMcOption(currentQuestion.mcOptions[optionIndex].id);
        }
      }

      // Backspace for Word Part deselection
      if (!isChecked && currentQuestion?.type === 'word_part_selection' && e.key === 'Backspace') {
        setSelectedParts((prev) => prev.slice(0, prev.length - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isChecked,
    isCorrect,
    showAnswerReview,
    showPauseMenu,
    showHintModal,
    hintLevel,
    isReviewSaving,
    reviewSchedule,
    currentQuestion,
    selectedMcOption,
    selectedParts,
    typingValue,
    partTypingValues,
  ]);

  if (!currentQuestion) {
    return (
      <div className="max-w-xl mx-auto my-20 p-8 text-center bg-slate-900 rounded-2xl border border-slate-800 text-slate-100 space-y-4">
        <Sparkles className="w-12 h-12 text-emerald-400 mx-auto" />
        <h2 className="text-2xl font-bold">Không có câu hỏi trong Session!</h2>
        <p className="text-slate-400 text-sm">Vui lòng kiểm tra lại Study Scope hoặc cài đặt ôn tập.</p>
        <button
          onClick={onExitSession}
          className="px-6 py-2.5 bg-emerald-500 text-slate-950 font-bold rounded-xl"
        >
          Quay lại Dashboard
        </button>
      </div>
    );
  }

  const progressPercent = Math.round(((currentIndex + 1) / questions.length) * 100);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans select-none">
      {/* Top Session Minimalist Header */}
      <header className="h-16 border-b border-slate-200 px-6 flex items-center justify-between bg-white/80 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-4">
          <button
            id="btn-pause-session"
            onClick={() => setShowPauseMenu(true)}
            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition"
            title="Pause Session (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-sm font-bold text-slate-700">
            Câu {currentIndex + 1} / {questions.length}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 max-w-md mx-6">
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Controls: Audio & Hint */}
        <div className="flex items-center gap-2">
          <button
            id="btn-session-audio"
            onClick={handlePlayAudio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition"
          >
            <Volume2 className="w-4 h-4 text-indigo-600" />
            <span>Phát [P]</span>
          </button>

          <button
            id="btn-session-hint"
            onClick={() => {
              setShowHintModal(true);
              setHintLevel((prev) => Math.min(5, prev + 1));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition"
          >
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <span>Gợi ý [H]</span>
          </button>
        </div>
      </header>

      {/* Main Learning Canvas Center */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Stage Indicator Pill */}
        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Stage {currentQuestion.stage}: {currentQuestion.type.replace(/_/g, ' ')}
          </span>
          {!currentQuestion.word.isGlobal && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              Private Word
            </span>
          )}
        </div>

          {/* Question Prompt */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {currentQuestion.prompt}
          </h2>

          {/* Context Display */}
          {currentQuestion.type === 'sentence_completion' && currentQuestion.exampleSentence && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200 text-lg text-indigo-900 font-medium shadow-xs">
              "{maskSentenceAnswer(currentQuestion.exampleSentence.sentence, currentQuestion.expectedAnswer)}"
            </div>
          )}
          {currentQuestion.type === 'image_question' && currentQuestion.word.imageUrl && (
            <img
              src={currentQuestion.word.imageUrl}
              alt={`Hình minh hoạ cho ${currentQuestion.word.word}`}
              className="max-h-56 max-w-full rounded-2xl object-contain border border-slate-200 shadow-sm"
            />
          )}

          {currentQuestion.type === 'full_word_typing' && (
            <div className="text-slate-500 text-sm font-mono">
              Part of speech: <span className="text-indigo-600 font-bold">{currentQuestion.targetMeaningCard.partOfSpeech}</span>
            </div>
          )}
        </div>

        {/* Dynamic Question Component Render */}
        <div className="w-full space-y-4">
          {/* MULTIPLE CHOICE TYPES */}
          {(currentQuestion.type === 'en_to_vn_mc' || currentQuestion.type === 'vn_to_en_mc') && (
            <div className="grid grid-cols-1 gap-3">
              {currentQuestion.mcOptions?.map((opt) => {
                const isSelected = selectedMcOption === opt.id;
                let btnStyle = 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-xs';

                if (isChecked) {
                  if (opt.isCorrect) {
                    btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
                  } else if (isSelected && !opt.isCorrect) {
                    btnStyle = 'bg-rose-50 border-rose-500 text-rose-900 font-bold';
                  }
                } else if (isSelected) {
                  btnStyle = 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-sm';
                }

                return (
                  <button
                    key={`${currentQuestion.id}-${opt.id}`}
                    onClick={() => {
                      if (isChecked && !isCorrect) {
                        // Allow selecting another option after a wrong check
                        setSelectedMcOption(opt.id);
                        setIsChecked(false);
                        setDiffResult(null);
                      } else if (!isChecked) {
                        setSelectedMcOption(opt.id);
                      }
                    }}
                    className={`p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${btnStyle}`}
                  >
                    <span className="text-base font-medium">{opt.label}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-xs text-slate-500 font-mono border border-slate-200 font-bold">
                      [{opt.keyShortcut}]
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* WORD-PART SELECTION TYPE */}
          {currentQuestion.type === 'word_part_selection' && (
            <div className="space-y-6">
              {currentQuestion.wordParts?.length ? (
                <>
                  {/* Selected Slots */}
                  <div className="min-h-[60px] p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-center gap-2 flex-wrap shadow-xs">
                    {selectedParts.length === 0 ? (
                      <span className="text-slate-400 text-sm">Chọn các thành phần phía dưới...</span>
                    ) : (
                      selectedParts.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            if (isChecked && !isCorrect) setIsChecked(false);
                            setSelectedParts((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-rose-50 text-indigo-700 hover:text-rose-700 border border-indigo-200 hover:border-rose-300 font-bold text-lg transition"
                          title="Bấm để xóa phần này"
                        >
                          {p.text}
                        </button>
                      ))
                    )}
                  </div>

                  {/* Pool of Available Parts */}
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {currentQuestion.wordParts.map((part) => (
                      <button
                        key={part.id}
                        onClick={() => {
                          if (isChecked && !isCorrect) setIsChecked(false);
                          setSelectedParts((prev) => [...prev, part]);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 font-mono font-bold text-slate-700 transition"
                      >
                        {part.text} <span className="text-xs text-slate-400">({part.type})</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <input
                  ref={inputRef}
                  value={typingValue}
                  onChange={(event) => {
                    if (isChecked && !isCorrect) setIsChecked(false);
                    setTypingValue(event.target.value);
                  }}
                  placeholder="Gõ toàn bộ từ tại đây..."
                  className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 text-center font-mono font-bold text-2xl text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
          )}

          {/* WORD-PART TYPING TYPE */}
          {currentQuestion.type === 'word_part_typing' && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {currentQuestion.stage === 4 && (
                <div className="w-full text-center text-sm font-semibold text-amber-700">
                  Stage 4: hỗ trợ một phần — hãy hoàn thiện các thành phần còn thiếu
                </div>
              )}
              {currentQuestion.wordParts?.map((part, partIndex) => (
                <div key={part.id} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500 uppercase font-bold">{part.type}</span>
                  <input
                    type="text"
                    value={partTypingValues[part.id] || ''}
                    autoFocus={partIndex === 0}
                    onChange={(e) => {
                      if (isChecked && !isCorrect) {
                        setIsChecked(false);
                      }
                      setPartTypingValues({ ...partTypingValues, [part.id]: e.target.value });
                    }}
                    placeholder={currentQuestion.stage === 4 ? `${part.type}...` : part.type}
                    className="w-32 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-center font-mono font-bold text-lg text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  />
                </div>
              ))}
            </div>
          )}

          {/* FULL-WORD TYPING & SENTENCE COMPLETION */}
          {(currentQuestion.type === 'full_word_typing' || currentQuestion.type === 'sentence_completion' || currentQuestion.type === 'image_question' || currentQuestion.type === 'audio_question') && (
            <div className="space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={typingValue}
                onChange={(e) => {
                  if (isChecked && !isCorrect) {
                    setIsChecked(false);
                  }
                  setTypingValue(e.target.value);
                }}
                placeholder="Gõ từ tiếng Anh tại đây..."
                autoFocus
                className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-300 text-center text-2xl font-bold font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm transition"
              />

              {/* Character Diff Feedback display on incorrect attempt */}
              {isChecked && !isCorrect && diffResult && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-2">
                  <div className="text-xs font-bold uppercase text-rose-700 flex items-center justify-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>Lỗi nhập liệu - Character Diff</span>
                  </div>

                  <CharacterDiffComparison
                    userInput={diffResult.normalizedUser}
                    expectedInput={diffResult.normalizedExpected}
                  />

                  <p className="text-xs text-rose-700 font-medium">
                    Lỗi phát hiện: {diffResult.errorTypes.join(', ') || 'Chưa đúng chính tả'}. Hãy sửa và Enter để thử lại!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Primary Action Button: Check ↵ or Retry */}
        {!isChecked ? (
          <button
            id="btn-check-answer"
            onClick={handleCheckAnswer}
            className="w-full max-w-sm flex items-center justify-center gap-2 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-md shadow-indigo-100 transition transform active:scale-[0.98]"
          >
            <span>Check</span>
            <CornerDownLeft className="w-5 h-5" />
          </button>
        ) : !isCorrect ? (
          <div className="w-full max-w-sm space-y-3 text-center">
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Đáp án chưa đúng. Bạn có thể chọn lại đáp án bên trên!</span>
            </div>
            <button
              id="btn-retry-answer"
              onClick={() => {
                setIsChecked(false);
                setDiffResult(null);
                if (isTypingQuestionType(currentQuestion.type)) {
                  setTypingValue('');
                  setPartTypingValues({});
                }
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-md shadow-indigo-100 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Thử lại / Chọn đáp án khác</span>
            </button>
          </div>
        ) : null}
      </main>

      {/* Answer Review Overlay Screen (Section 3.4 & 10) */}
      {showAnswerReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="max-w-2xl max-h-[90vh] w-full bg-white border border-slate-200 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl">
            {/* Answer Result Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-emerald-700">Chính xác!</h3>
                  <p className="text-xs text-slate-500">Lịch sử SRS cho thẻ này đã được cập nhật</p>
                </div>
              </div>

              <button
                onClick={handlePlayAudio}
                className="p-3 rounded-full bg-slate-100 hover:bg-slate-200 text-indigo-600 border border-slate-200 transition"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-6 pr-1">
            {/* Target Word & IPA */}
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                  {currentQuestion.word.word}
                </h2>
                <span className="text-lg font-mono text-indigo-600 font-bold">
                  {currentQuestion.word.ipa || `/${currentQuestion.word.word}/`}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Tất cả nghĩa và ví dụ
              </div>
              {currentQuestion.word.meanings.map((meaning) => {
                const isTested =
                  meaning.id === currentQuestion.targetMeaningCard.id;
                return (
                  <section
                    key={meaning.id}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      isTested
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-bold text-slate-900">
                        {meaning.meaning}
                      </p>
                      <span className="text-xs text-indigo-600 font-mono font-bold">
                        ({meaning.partOfSpeech})
                      </span>
                    </div>
                    {meaning.definitionEn && (
                      <p className="text-sm text-slate-600">
                        {meaning.definitionEn}
                      </p>
                    )}
                    {meaning.exampleSentences.length > 0 && (
                      <ol className="space-y-2">
                        {meaning.exampleSentences.map((example, index) => (
                          <li
                            key={example.id}
                            className="flex gap-2 rounded-xl border border-white/80 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            <span className="font-bold text-indigo-500">
                              {index + 1}.
                            </span>
                            <span>{example.sentence}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                );
              })}
            </div>

            {reviewSchedule && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 font-semibold text-indigo-800">
                  Predicted recall: {Math.round(reviewSchedule.retrievability * 100)}%
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 font-semibold text-indigo-800">
                  Review again: {formatRelativeDueTime(reviewSchedule.card.due)}
                </div>
              </div>
            )}

            {reviewSaveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 space-y-2">
                <p>Chưa lưu được tiến trình ôn tập. Hãy thử lại trước khi tiếp tục.</p>
                <button
                  type="button"
                  onClick={() => reviewRetryRef.current?.()}
                  className="rounded-lg bg-rose-600 px-3 py-2 font-semibold text-white"
                >
                  Thử lưu lại
                </button>
              </div>
            )}

            {/* Word Structure Breakdown */}
            {currentQuestion.word.wordStructure.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  Cấu tạo từ (Morphology):
                </div>
                <div className="flex gap-2 flex-wrap">
                  {currentQuestion.word.wordStructure.map((p) => (
                    <div
                      key={p.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono"
                    >
                      <span className="text-indigo-600 font-bold">{p.text}</span>{' '}
                      <span className="text-slate-500">({p.type})</span>
                      {p.meaning && <span className="text-slate-700 ml-1.5">- {p.meaning}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>

            {/* Continue Button */}
            <button
              id="btn-continue-overlay"
              onClick={handleContinueNext}
              disabled={Boolean(onReviewCompleted && (isReviewSaving || !reviewSchedule))}
              className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 text-white font-bold text-lg shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition"
            >
              <span>{isReviewSaving ? 'Đang lưu...' : 'Tiếp tục (Continue ↵)'}</span>
              <CornerDownLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Adaptive Hint Modal (Section 9) */}
      {showHintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-amber-200 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-amber-800 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-600" />
                <span>Gợi ý - Level {hintLevel}</span>
              </h3>
              <button
                onClick={() => setShowHintModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-800">
              {hintLevel >= 1 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <strong>Số ký tự:</strong> {currentQuestion.expectedAnswer.length} chữ cái
                </div>
              )}
              {hintLevel >= 2 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <strong>Chữ cái đầu:</strong> "{currentQuestion.expectedAnswer[0].toUpperCase()}"
                </div>
              )}
              {hintLevel >= 3 && currentQuestion.word.wordStructure.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <strong>Giải thích cấu tạo:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-xs text-slate-700">
                    {currentQuestion.word.wordStructure.map((p, i) => (
                      <li key={i}>
                        {p.type}: <strong>{p.text}</strong> ({p.meaning})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hintLevel >= 5 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                  <strong>Đáp án đầy đủ:</strong> {currentQuestion.expectedAnswer}
                  <div className="text-[11px] text-slate-500 mt-1">
                    (Khi mở xem đáp án đầy đủ, kết quả được tính là Completion, không tính Independent Recall)
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowHintModal(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition"
            >
              Đã hiểu, tiếp tục thử lại
            </button>
          </div>
        </div>
      )}

      {/* Pause Menu Modal */}
      {showPauseMenu && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-6 space-y-4 text-center shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">Pause Session</h3>
            <p className="text-sm text-slate-500">Tiến trình học của bạn đang được lưu tạm thời.</p>
            <div className="space-y-2">
              <button
                onClick={() => setShowPauseMenu(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
              >
                Tiếp tục học
              </button>
              <button
                onClick={onExitSession}
                className="w-full py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl border border-slate-200 font-semibold transition"
              >
                Thoát về Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
