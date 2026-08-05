import React, { useEffect, useRef, useState } from 'react';
import type {User} from '@supabase/supabase-js';
import {LoginView} from './features/auth/LoginView';
import {useAuth} from './features/auth/AuthProvider';
import {
  Word,
  Deck,
  Tag,
  StudyScope,
  UserSettings,
  UserRole,
  MemoryStrength,
  WordStudyStatus,
  SessionStats,
  StudyAttemptInput,
  MeaningCard,
  Question,
} from './types';
import {
  INITIAL_WORDS,
  INITIAL_DECKS,
  INITIAL_TAGS,
  INITIAL_STUDY_SCOPE,
  INITIAL_SETTINGS,
} from './data/mockData';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { LearningSessionView } from './components/LearningSessionView';
import { VocabularyLibraryView } from './components/VocabularyLibraryView';
import { WordDetailModal } from './components/WordDetailModal';
import {deleteWordImage} from './features/images/r2ImageUpload';
import { AddWordModal } from './components/AddWordModal';
import { JsonImportModal, type ImportSummary } from './components/JsonImportModal';
import { DecksAndTagsView } from './components/DecksAndTagsView';
import { StudyScopeModal } from './components/StudyScopeModal';
import { ProgressView } from './components/ProgressView';
import { SettingsView } from './components/SettingsView';
import { AdminWorkspace } from './components/AdminWorkspace';
import { RootWordInsightsView } from './components/RootWordInsightsView';
import { buildSessionQuestions } from './utils/sessionBuilder';
import {getSupabaseClient} from './lib/supabase';
import {
  saveAiProviderSettings,
  saveGeminiApiKey,
  saveSettings,
  saveStudyScope,
} from './features/persistence/settingsRepository';
import type {
  AiProviderSettings,
  SaveAiProviderSettingsInput,
} from './features/persistence/settingsRepository';
import {
  completeStudySession,
  createStudySession,
  getDailyNewWordUsage,
  getLearningCardSchedule,
  getStudyAttemptAnalytics,
  pauseStudySession,
  submitLearningReview,
} from './features/persistence/sessionRepository';
import {renumberSessionAttempt} from './features/persistence/sessionAttemptSequence';
import {aggregateSentenceAnalytics} from './features/analytics/sentenceAnalytics';
import type {ProgressAttemptRow} from './features/analytics/progressAnalytics';
import type {AutomaticRating} from './features/scheduling/automaticRating';
import {
  scheduleCard,
  type ScheduledLearningCard,
} from './features/scheduling/fsrsScheduler';
import {updateSkillScores, type SkillScoreInput} from './features/scheduling/skillScores';
import {
  createPrivateWord,
  linkGlobalWord,
  loadLearnerState,
  moveWordsToDeck,
  saveDeck,
  saveTag,
  saveWordStatus,
  saveWordStatuses,
  deleteWord,
} from './features/persistence/vocabularyRepository';
import {
  createCsvImportBatch,
  listResumableCsvImports,
  markCsvImportRow,
  updateCsvImportStatus,
  type CsvImportRowInput,
  type ResumableCsvImportRow,
} from './features/persistence/importRepository';
import {routeImportedRow} from './features/import/importRouting';
import {resolveJsonImportWords} from './features/import/jsonImportResolver';
import {getStudyDate} from './lib/studyDate';

export default function App() {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return <LoginView />;

  return (
    <React.Fragment key={auth.user?.id ?? 'authenticated'}>
      <AuthenticatedApp
        roles={auth.roles}
        user={auth.user}
        signOut={auth.signOut}
      />
    </React.Fragment>
  );
}

function AuthenticatedApp({
  roles,
  user,
  signOut,
}: {
  roles: string[];
  user: User | null;
  signOut: () => Promise<void>;
}) {
  const authenticatedRole: UserRole = roles.includes('admin') ? 'admin' : 'learner';
  const client = getSupabaseClient();
  // Main Application State
  const [words, setWords] = useState<Word[]>(() => client ? [] : INITIAL_WORDS);
  const [decks, setDecks] = useState<Deck[]>(() => client ? [] : INITIAL_DECKS);
  const [tags, setTags] = useState<Tag[]>(() => client ? [] : INITIAL_TAGS);
  const [globalWords, setGlobalWords] = useState<
    Array<Pick<Word, 'id' | 'word' | 'ipa'>>
  >(() => client
    ? []
    : INITIAL_WORDS
      .filter(({isGlobal}) => isGlobal)
      .map(({id, word, ipa}) => ({id, word, ipa}))
  );
  const [studyScope, setStudyScope] = useState<StudyScope | null>(
    () => client ? null : INITIAL_STUDY_SCOPE,
  );
  const [settings, setSettings] = useState<UserSettings | null>(
    () => client ? null : INITIAL_SETTINGS,
  );
  const [attemptAnalytics, setAttemptAnalytics] = useState<ProgressAttemptRow[]>([]);
  const [dailyNewWordsStarted, setDailyNewWordsStarted] = useState(0);
  const [isHydrating, setIsHydrating] = useState(Boolean(client));
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [hydrationVersion, setHydrationVersion] = useState(0);
  const userRole = authenticatedRole;

  // Navigation State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Learning Session State
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [isExtraReviewSession, setIsExtraReviewSession] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSessionStartPending, setIsSessionStartPending] = useState(false);
  const sessionStartPendingRef = useRef(false);
  const pendingAttemptsRef = useRef(new Map<string, StudyAttemptInput[]>());
  const attemptNumberByCardRef = useRef(new Map<string, number>());

  // Modals & Overlay States
  const [showStudyScopeModal, setShowStudyScopeModal] = useState<boolean>(false);
  const [showAddWordModal, setShowAddWordModal] = useState<boolean>(false);
  const [showJsonImportModal, setShowJsonImportModal] = useState<boolean>(false);
  const [resumableJsonRows, setResumableJsonRows] = useState<ResumableCsvImportRow[]>([]);
  const [selectedWordDetail, setSelectedWordDetail] = useState<Word | null>(null);
  const [vocabularyMemoryFilter, setVocabularyMemoryFilter] = useState<MemoryStrength | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !user) return;
    let alive = true;
    setIsHydrating(true);
    setHydrationError(null);
    setWords([]);
    setDecks([]);
    setTags([]);
    setGlobalWords([]);
    setStudyScope(null);
    setSettings(null);
    setAttemptAnalytics([]);
    setDailyNewWordsStarted(0);

    void loadLearnerState(user.id).then((result) => {
      if (!alive) return;
      if (result.error) {
        setHydrationError(result.error);
      } else {
        setWords(result.data.words);
        setGlobalWords(result.data.globalWords);
        setDecks(result.data.decks);
        setTags(result.data.tags);
        setStudyScope(result.data.studyScope);
        setSettings(result.data.settings);
      }
      setIsHydrating(false);
    });
    void listResumableCsvImports(user.id).then((result) => {
      if (alive && result.data) setResumableJsonRows(result.data);
    });
    void getStudyAttemptAnalytics(user.id).then((result) => {
      if (alive) {
        setAttemptAnalytics((result.data ?? []).map((row) => ({
          learning_card_id: row.learning_card_id ?? '',
          sentence_key: row.sentence_key,
          question_type: row.question_type,
          is_correct: row.is_correct,
          first_attempt: row.first_attempt,
          response_time_ms: row.response_time_ms,
          hint_level: row.hint_level ?? 0,
          answer_revealed: row.answer_revealed ?? false,
          created_at: row.created_at,
        })));
      }
    });
    const studyDate = getStudyDate(new Date(), 'Asia/Ho_Chi_Minh');
    void getDailyNewWordUsage(user.id, studyDate).then((result) => {
      if (alive && result.data !== null) setDailyNewWordsStarted(result.data);
    });

    return () => {
      alive = false;
    };
  }, [client, hydrationVersion, user?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const refreshDailyNewWordUsage = async () => {
    if (!client || !user) return;
    const studyDate = getStudyDate(new Date(), 'Asia/Ho_Chi_Minh');
    const usage = await getDailyNewWordUsage(user.id, studyDate);
    if (usage.data !== null) setDailyNewWordsStarted(usage.data);
  };

  if (client && (isHydrating || !settings || !studyScope)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-white border border-slate-200 p-6 text-center space-y-4 shadow-sm">
          {hydrationError ? (
            <>
              <p role="alert" className="text-sm text-rose-700">
                {hydrationError}
              </p>
              <button
                onClick={() => setHydrationVersion((version) => version + 1)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
              >
                Thử tải lại
              </button>
            </>
          ) : (
            <p role="status" className="text-sm text-slate-600">
              Đang tải dữ liệu học tập...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!settings || !studyScope) return null;

  // Toggle User Role (Learner vs Admin)

  // Start Learning Session Builder
  const activateLearningSession = async (
    questions: Question[],
    isExtraReview: boolean,
  ) => {
    if (sessionStartPendingRef.current) return;
    pendingAttemptsRef.current.clear();
    attemptNumberByCardRef.current.clear();
    sessionStartPendingRef.current = true;
    setIsSessionStartPending(true);
    let sessionId: string | null = null;
    try {
      if (client && user) {
        const result = await createStudySession(user.id, {
          scopeSnapshot: studyScope,
          reviewLimit: settings.reviewLimitPerDay,
          newWordLimit: settings.newWordsPerDay,
        });
        if (result.error) {
          showToast(result.error);
        } else {
          sessionId = result.data;
        }
      }
    } catch {
      showToast('Không thể lưu phiên học. Tiến trình cục bộ vẫn được giữ.');
    } finally {
      sessionStartPendingRef.current = false;
      setIsSessionStartPending(false);
    }
    setActiveSessionId(sessionId);
    setActiveQuestions(questions);
    setIsExtraReviewSession(isExtraReview);
    setIsSessionActive(true);
  };

  const handleStartLearning = async (isExtraReview: boolean = false) => {
    let newWordsLimitOverride: number | undefined;
    if (!isExtraReview && client && user) {
      const studyDate = getStudyDate(new Date(), 'Asia/Ho_Chi_Minh');
      const usage = await getDailyNewWordUsage(user.id, studyDate);
      if (usage.error || usage.data === null) {
        showToast(usage.error ?? 'Không thể tải quota từ mới hôm nay.');
        return;
      }
      newWordsLimitOverride = Math.max(0, settings.newWordsPerDay - usage.data);
    }
    const {questions} = buildSessionQuestions(
      words,
      studyScope,
      settings,
      isExtraReview,
      newWordsLimitOverride,
    );
    if (questions.length === 0) {
      showToast('Không có từ vựng nào cần học trong Study Scope hiện tại!');
      return;
    }
    await activateLearningSession(questions, isExtraReview);
  };

  const handlePracticeSingleWord = async (wordId: string) => {
    const targetWord = words.find((w) => w.id === wordId);
    if (!targetWord) return;

    const session = buildSessionQuestions([targetWord], studyScope, settings, true);
    if (session.questions.length > 0) {
      await activateLearningSession(session.questions, true);
    }
  };

  const handleMeaningCardUpdated = (
    wordId: string,
    meaningCardId: string,
    updatedCard: MeaningCard
  ) => {
    setWords((prev) =>
      prev.map((word) =>
        word.id === wordId
          ? {
              ...word,
              meanings: word.meanings.map((card) =>
                card.id === meaningCardId ? updatedCard : card
              ),
            }
          : word
      )
    );
  };

  const handleFinishSession = (stats: SessionStats) => {
    const sessionId = activeSessionId;
    setIsSessionActive(false);
    setActiveSessionId(null);
    showToast(
      `Hoàn thành Session! Độ chính xác lần đầu: ${stats.firstAttemptAccuracy}% • Đã ôn ${stats.reviewsCompleted} card(s).`
    );
    setCurrentTab('dashboard');
    void refreshDailyNewWordUsage();
    if (client && user && sessionId) {
      void completeStudySession(
        user.id,
        sessionId,
        new Date().toISOString(),
      ).then((result) => {
        if (result.error) showToast(result.error);
      });
    }
  };

  const handleAttempt = async (attempt: StudyAttemptInput) => {
    if (!client || !user || !activeSessionId) return;
    const cardId = attempt.learningCardId;
    const renumberedAttempt = renumberSessionAttempt(
      attemptNumberByCardRef.current.get(cardId) ?? 0,
      attempt,
    );
    attemptNumberByCardRef.current.set(cardId, renumberedAttempt.attemptNumber);
    const current = pendingAttemptsRef.current.get(cardId) ?? [];
    pendingAttemptsRef.current.set(cardId, [...current, renumberedAttempt]);
  };

  const handleReviewCompleted = async (
    learningCardId: string,
    rating: AutomaticRating,
    reviewedAt: Date,
    skillInput?: SkillScoreInput,
  ): Promise<ScheduledLearningCard | null> => {
    if (!client || !user) return null;

    try {
      const current = await getLearningCardSchedule(user.id, learningCardId);
      if (current.error) {
        showToast(current.error);
        return null;
      }

      const scheduled = scheduleCard(current.data, rating, reviewedAt);
      const next = {
        ...scheduled.persistence,
        ...(skillInput ? updateSkillScores(current.data, skillInput) : {}),
      };
      const attempts = pendingAttemptsRef.current.get(learningCardId) ?? [];
      if (attempts.length === 0 || !activeSessionId) {
        showToast('Không tìm thấy lần trả lời đang chờ lưu. Vui lòng thử lại.');
        return null;
      }

      const idempotencyKey = `${activeSessionId}:${learningCardId}:${attempts.map(({attemptNumber}) => attemptNumber).join('-')}`;
      const reviewedQuestion = activeQuestions.find(
        (question) => question.targetMeaningCard.id === learningCardId,
      );
      const result = await submitLearningReview({
        userId: user.id,
        sessionId: activeSessionId,
        learningCardId,
        idempotencyKey,
        isNewWord: reviewedQuestion?.isNewWord ?? false,
        studyDate: getStudyDate(reviewedAt, 'Asia/Ho_Chi_Minh'),
        dailyLimit: settings.newWordsPerDay,
        attempts,
        schedule: next,
      });
      if (result.error) {
        showToast(result.error);
        return null;
      }

      pendingAttemptsRef.current.delete(learningCardId);
      if (reviewedQuestion?.isNewWord) {
        setDailyNewWordsStarted((current) => current + 1);
        void refreshDailyNewWordUsage();
      }
      setAttemptAnalytics((previous) => [...previous, ...attempts.map((attempt) => ({
        learning_card_id: attempt.learningCardId,
        sentence_key: attempt.sentenceKey ?? null,
        question_type: attempt.questionType,
        is_correct: attempt.isCorrect,
        first_attempt: attempt.firstAttempt,
        response_time_ms: attempt.responseTimeMs,
        hint_level: attempt.hintLevel,
        answer_revealed: attempt.answerRevealed,
        created_at: new Date().toISOString(),
      }))]);
      setWords((previous) => previous.map((word) => ({
        ...word,
        meanings: word.meanings.map((card) => card.id === learningCardId
          ? {
            ...card,
            memoryScore: next.memory_score,
            memoryStrength: next.memory_strength,
            fsrsState: next.fsrs_state,
            fsrsStability: next.fsrs_stability,
            fsrsDifficulty: next.fsrs_difficulty,
            fsrsElapsedDays: next.fsrs_elapsed_days,
            fsrsScheduledDays: next.fsrs_scheduled_days,
            fsrsLearningSteps: next.fsrs_learning_steps,
            fsrsReps: next.fsrs_reps,
            fsrsLapses: next.fsrs_lapses,
            fsrsRetrievability: next.fsrs_retrievability,
            reviewIntervalDays: next.review_interval_days,
            nextReviewDate: next.next_review_at,
            lastReviewedDate: next.last_reviewed_at ?? undefined,
            recognitionScore: next.recognition_score,
            recallScore: next.recall_score,
            spellingScore: next.spelling_score,
            contextScore: next.context_score,
            wordStructureScore: next.word_structure_score,
            responseTimeSampleCount: next.response_time_sample_count,
            responseTimeAverageMs: next.response_time_average_ms,
          }
          : card),
      })));

      return scheduled;
    } catch {
      showToast('Không thể tải trạng thái ôn tập. Tiến trình cục bộ vẫn được giữ.');
      return null;
    }
  };

  const handleExitSession = () => {
    const sessionId = activeSessionId;
    setIsSessionActive(false);
    setActiveSessionId(null);
    if (client && user && sessionId) {
      void pauseStudySession(user.id, sessionId).then((result) => {
        if (result.error) showToast(result.error);
      });
    }
  };

  // Vocabulary handlers
  const handleUpdateWordStatus = async (
    wordId: string,
    status: WordStudyStatus,
  ) => {
    if (client && user) {
      const result = await saveWordStatus(user.id, wordId, status);
      if (result.error) {
        showToast(result.error);
        return false;
      }
    }
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, status } : w))
    );
    showToast(`Đã cập nhật trạng thái từ sang: ${status}`);
    return true;
  };

  const handleBulkUpdateStatus = async (
    wordIds: string[],
    status: WordStudyStatus,
  ) => {
    if (client && user) {
      const result = await saveWordStatuses(user.id, wordIds, status);
      if (result.error) {
        showToast(result.error);
        return false;
      }
    }
    setWords((prev) =>
      prev.map((w) => (wordIds.includes(w.id) ? { ...w, status } : w))
    );
    showToast(`Đã cập nhật ${wordIds.length} từ sang: ${status}`);
    return true;
  };

  const handleDeleteWord = async (word: Word) => {
    if (!window.confirm(`Xoá vĩnh viễn từ "${word.word}"? Dữ liệu học và nghĩa sẽ bị xoá và không thể khôi phục.`)) return false;
    if (client && user) {
      const result = await deleteWord(user.id, word.id, word.privateWordId);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      if (word.privateWordId && word.imageObjectKey) {
        await deleteWordImage(word.imageObjectKey);
      }
    }
    setWords((prev) => prev.filter(({id}) => id !== word.id));
    showToast(`Đã xoá vĩnh viễn từ "${word.word}".`);
    return true;
  };

  const handleAddWord = async (newWord: Word) => {
    const normalizedWord = newWord.word.trim().toLowerCase();
    if (words.some((word) =>
      !word.isGlobal && word.word.trim().toLowerCase() === normalizedWord
    )) {
      showToast(`Từ "${normalizedWord}" đã có trong danh sách học cá nhân.`);
      return false;
    }

    let savedWord = newWord;
    if (client && user) {
      const result = await createPrivateWord(user.id, newWord);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      savedWord = result.data;
    }
    setWords((prev) => [savedWord, ...prev]);
    showToast(`Đã thêm từ "${savedWord.word}" vào danh sách học cá nhân!`);
    return true;
  };

  const handleLinkExistingGlobalWord = async (wordId: string) => {
    const existingWord = words.find(({id}) => id === wordId);
    if (client && user) {
      const result = existingWord
        ? await saveWordStatus(user.id, wordId, 'active')
        : await linkGlobalWord(user.id, wordId, decks[0]?.id ?? null);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      if (!existingWord) {
        setWords((prev) => [result.data as Word, ...prev]);
        setGlobalWords((prev) => prev.filter(({id}) => id !== wordId));
      }
    }
    if (existingWord) {
      setWords((prev) =>
        prev.map((word) =>
          word.id === wordId ? {...word, status: 'active'} : word
        )
      );
    }
    showToast('Đã thêm từ Global Vocabulary vào danh sách học của bạn!');
    return true;
  };

  const handleMoveWords = async (wordIds: string[], deckId: string) => {
    if (client && user) {
      const result = await moveWordsToDeck(user.id, wordIds, deckId);
      if (result.error) {
        showToast(result.error);
        return false;
      }
    }
    setWords((prev) =>
      prev.map((word) => wordIds.includes(word.id)
        ? {...word, deckId}
        : word)
    );
    showToast(`Đã chuyển ${wordIds.length} từ sang Deck mới.`);
    return true;
  };

  const handleCreateDeck = async (deck: Deck): Promise<Deck | null> => {
    let savedDeck = deck;
    if (client && user) {
      const result = await saveDeck(user.id, deck);
      if (result.error) {
        showToast(result.error);
        return null;
      }
      savedDeck = result.data;
    }
    setDecks((prev) => [...prev, savedDeck]);
    showToast(`Đã tạo Deck "${savedDeck.name}".`);
    return savedDeck;
  };

  const handleCreateTag = async (tag: Tag): Promise<Tag | null> => {
    let savedTag = tag;
    if (client && user) {
      const result = await saveTag(user.id, tag);
      if (result.error) {
        showToast(result.error);
        return null;
      }
      savedTag = result.data;
    }
    setTags((prev) => [...prev, savedTag]);
    showToast(`Đã tạo Tag "${savedTag.name}".`);
    return savedTag;
  };

  const handleUpdateSettings = async (nextSettings: UserSettings) => {
    if (client && user) {
      const result = await saveSettings(user.id, nextSettings);
      if (result.error) {
        showToast(result.error);
        return false;
      }
    }
    setSettings(nextSettings);
    showToast('Đã cập nhật cài đặt!');
    return true;
  };

  const handleSaveGeminiApiKey = async (apiKey: string | null) => {
    const normalizedKey = apiKey?.trim() || null;
    if (client && user) {
      const result = await saveGeminiApiKey(user.id, normalizedKey);
      if (result.error) {
        showToast(result.error);
        return false;
      }
    }
    setSettings((current) => current
      ? {...current, geminiApiKey: normalizedKey}
      : current
    );
    showToast(normalizedKey
      ? 'Đã lưu Gemini API key cá nhân.'
      : 'Đã xóa Gemini API key cá nhân.'
    );
    return true;
  };

  const handleSaveAiProviderSettings = async (
    providerSettings: SaveAiProviderSettingsInput,
  ) => {
    let savedSettings: AiProviderSettings = {
      aiProvider: providerSettings.aiProvider,
      geminiApiKey: providerSettings.geminiApiKey,
      openAICompatibleBaseUrl:
        providerSettings.openAICompatibleBaseUrl,
      openAICompatibleTokenConfigured:
        providerSettings.openAICompatibleTokenConfigured,
      openAICompatibleModel: providerSettings.openAICompatibleModel,
    };
    if (client && user) {
      const result = await saveAiProviderSettings(user.id, providerSettings);
      if (result.error || !result.data) {
        showToast(result.error ?? 'Không thể lưu cấu hình AI.');
        return false;
      }
      savedSettings = result.data;
    }
    setSettings((current) => current
      ? {...current, ...savedSettings}
      : current
    );
    showToast('Đã lưu cấu hình nhà cung cấp AI.');
    return true;
  };

  const handleSaveStudyScope = async (nextScope: StudyScope) => {
    if (client && user) {
      const result = await saveStudyScope(user.id, nextScope);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      setStudyScope(result.data);
    } else {
      setStudyScope(nextScope);
    }
    showToast('Đã lưu Study Scope mới làm mặc định!');
    return true;
  };

  const handleConfirmJsonImport = async (
    importedWords: Word[],
    importRows: CsvImportRowInput[],
  ): Promise<ImportSummary> => {
    if (!client || !user) {
      setWords((prev) => [...importedWords, ...prev]);
      showToast(`Đã import thành công ${importedWords.length} từ vựng từ JSON!`);
      return {created: importedWords.length, linked: 0, skippedDuplicate: 0, failed: 0};
    }

    const rows = importRows.map((row) => ({
      ...row,
      rawData: row.rawData,
    }));
    const existingImportId = rows.find(({importId}) => importId)?.importId;
    const batch = existingImportId
      ? {data: {importId: existingImportId, rowIds: rows.map(({id}) => id ?? '')}, error: null}
      : await createCsvImportBatch(user.id, 'json-import.json', rows);
    if (batch.error || !batch.data) {
      showToast(batch.error ?? 'Không thể bắt đầu import JSON.');
      return {created: 0, linked: 0, skippedDuplicate: 0, failed: importedWords.length};
    }

    await updateCsvImportStatus(user.id, batch.data.importId, 'importing');
    const persistedWords: Word[] = [];
    let processedRows = 0;
    let created = 0;
    let linked = 0;
    let skippedDuplicate = 0;
    let failed = 0;
    const rowIds = batch.data.rowIds;

    for (const [index, importedWord] of importedWords.entries()) {
      const row = rows[index];
      const route = row
        ? routeImportedRow(row.rawData, words)
        : {kind: 'create_private' as const};
      let result = route.kind === 'create_private'
        ? await createPrivateWord(user.id, importedWord)
        : {data: null, error: null};

      if (route.kind === 'duplicate_private') {
        result = {data: null, error: null};
      } else if (route.kind === 'link_global') {
        const globalMatch = globalWords.find((candidate) =>
          candidate.word.trim().toLowerCase() === importedWord.word.trim().toLowerCase(),
        );
        if (globalMatch) {
          result = await linkGlobalWord(user.id, globalMatch.id, importedWord.deckId || null);
        } else {
          result = {data: null, error: 'Không tìm thấy Global Word để liên kết.'};
        }
      }
      const rowId = rowIds[index];
      if (result.data && !result.error) {
        persistedWords.push(result.data);
        processedRows++;
        if (route.kind === 'link_global') linked++; else created++;
        if (rowId) await markCsvImportRow(user.id, batch.data.importId, rowId, 'imported', null);
      } else if (route.kind === 'duplicate_private' && rowId) {
        processedRows++;
        skippedDuplicate++;
        await markCsvImportRow(user.id, batch.data.importId, rowId, 'skipped', {reason: 'duplicate_private'});
      } else if (rowId) {
        failed++;
        await markCsvImportRow(user.id, batch.data.importId, rowId, 'failed', {message: result.error});
      }
    }

    await updateCsvImportStatus(
      user.id,
      batch.data.importId,
      processedRows === importedWords.length ? 'completed' : 'failed',
    );
    setWords((prev) => [...persistedWords, ...prev]);
    showToast(`Đã lưu ${persistedWords.length}/${importedWords.length} từ JSON vào database.`);
    return {created, linked, skippedDuplicate, failed};
  };

  const handleResumeJsonImport = async (pendingRows: ResumableCsvImportRow[]) => {
    const entries = pendingRows.map(({raw_data}) => raw_data);
    const words = await resolveJsonImportWords(entries, decks, tags, handleCreateDeck, handleCreateTag);
    await handleConfirmJsonImport(
      words,
      pendingRows.map(({id, import_id, source_row_number, canonical_key, raw_data}) => ({
        id,
        importId: import_id,
        sourceRowNumber: source_row_number,
        canonicalKey: canonical_key,
        rawData: raw_data,
      })),
    );
    setResumableJsonRows([]);
  };

  // Export Learning Data JSON
  const handleExportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(words, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `vocab_anki_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Đã xuất file dữ liệu cá nhân thành công!');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl bg-slate-900 text-white font-medium text-sm shadow-xl border border-slate-800 animate-bounce flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Left Sidebar (Hidden during active Learning Session to reduce distraction) */}
      {!isSessionActive && (
        <Navbar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            if (tab === 'learn') {
              handleStartLearning(false);
            } else {
              setCurrentTab(tab);
            }
          }}
          isSessionStartPending={isSessionStartPending}
          userRole={userRole}
          onOpenStudyScope={() => setShowStudyScopeModal(true)}
          userProfile={{
            name: (user?.user_metadata.full_name || user?.user_metadata.name || user?.email || 'Learner') as string,
            email: user?.email || '',
            avatarUrl: (user?.user_metadata.avatar_url || user?.user_metadata.picture) as string | undefined,
          }}
          onSignOut={() => void signOut()}
        />
      )}

      {/* Main View Router */}
      {isSessionActive ? (
        <LearningSessionView
          questions={activeQuestions}
          settings={settings}
          isExtraReview={isExtraReviewSession}
          onMeaningCardUpdated={handleMeaningCardUpdated}
          onAttempt={handleAttempt}
          onReviewCompleted={handleReviewCompleted}
          onFinishSession={handleFinishSession}
          onExitSession={handleExitSession}
        />
      ) : (
        <main className="md:ml-64 lg:ml-72 transition-all min-h-screen pb-12">
          {currentTab === 'dashboard' && (
            <DashboardView
              words={words}
              newWordsStartedToday={dailyNewWordsStarted}
              studyScope={studyScope}
              settings={settings}
              isSessionStartPending={isSessionStartPending}
              onStartLearning={handleStartLearning}
              onOpenStudyScope={() => setShowStudyScopeModal(true)}
              onOpenFilteredVocabulary={({ memoryStrength }) => {
                setVocabularyMemoryFilter(memoryStrength || null);
                setCurrentTab('vocabulary');
              }}
              onPracticeWord={handlePracticeSingleWord}
            />
          )}

          {currentTab === 'learn' && (
            <div className="max-w-xl mx-auto my-16 p-8 text-center bg-white rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900">Bắt đầu phiên học ngay!</h2>
              <p className="text-slate-500 text-sm">
                Hệ thống sẽ chuẩn bị câu hỏi theo danh sách ưu tiên SRS và Study Scope của bạn.
              </p>
              <button
                disabled={isSessionStartPending}
                onClick={() => handleStartLearning(false)}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl shadow-md shadow-indigo-100 transition"
              >
                Bắt đầu phiên học
              </button>
            </div>
          )}

          {currentTab === 'rootword' && (
            <RootWordInsightsView
              words={words}
              isSessionStartPending={isSessionStartPending}
              onPracticeWord={handlePracticeSingleWord}
              onOpenWordDetail={(w) => setSelectedWordDetail(w)}
            />
          )}

          {currentTab === 'add_word' && (
            <AddWordModal
              decks={decks}
              tags={tags}
              globalWords={globalWords}
              linkedGlobalWords={words
                .filter(({isGlobal}) => isGlobal)
                .map(({id, word, ipa}) => ({id, word, ipa}))
              }
              aiSettings={{
                aiProvider: settings.aiProvider,
                geminiApiKey: settings.geminiApiKey,
                openAICompatibleTokenConfigured:
                  settings.openAICompatibleTokenConfigured,
              }}
              onAddWord={async (newWord) => {
                return handleAddWord(newWord);
              }}
              onLinkExistingGlobalWord={async (id) => {
                return handleLinkExistingGlobalWord(id);
              }}
              onClose={() => setCurrentTab('vocabulary')}
            />
          )}

          {currentTab === 'import_json' && (
            <JsonImportModal
              existingWords={words}
              decks={decks}
              tags={tags}
              onCreateDeck={handleCreateDeck}
              onCreateTag={handleCreateTag}
              resumableRows={resumableJsonRows}
              onResumeImport={handleResumeJsonImport}
              onConfirmImport={handleConfirmJsonImport}
              onClose={() => setCurrentTab('vocabulary')}
            />
          )}

          {currentTab === 'vocabulary' && (
            <VocabularyLibraryView
              words={words}
              decks={decks}
              tags={tags}
              initialMemoryFilter={vocabularyMemoryFilter}
              onOpenAddWordModal={() => setCurrentTab('add_word')}
              onOpenWordDetail={(w) => setSelectedWordDetail(w)}
              onUpdateWordStatus={handleUpdateWordStatus}
              onBulkUpdateStatus={handleBulkUpdateStatus}
              onBulkMoveDeck={handleMoveWords}
              onDeleteWord={handleDeleteWord}
            />
          )}

          {currentTab === 'decks_tags' && (
            <DecksAndTagsView
              decks={decks}
              tags={tags}
              words={words}
              onCreateDeck={handleCreateDeck}
              onCreateTag={handleCreateTag}
            />
          )}

          {currentTab === 'analytics' && (
            <ProgressView
              words={words}
              studyScope={studyScope}
              attempts={attemptAnalytics}
              sentenceAnalytics={aggregateSentenceAnalytics(attemptAnalytics)}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              studyScope={studyScope}
              words={words}
              onUpdateSettings={handleUpdateSettings}
              onSaveGeminiApiKey={handleSaveGeminiApiKey}
              onSaveAiProviderSettings={handleSaveAiProviderSettings}
              onExportData={handleExportData}
            />
          )}

          {currentTab === 'admin' && userRole === 'admin' && (
            <AdminWorkspace
            />
          )}
        </main>
      )}

      {/* Modals & Overlays */}
      {showStudyScopeModal && (
        <StudyScopeModal
          studyScope={studyScope}
          decks={decks}
          tags={tags}
          words={words}
          onSaveScope={handleSaveStudyScope}
          onClose={() => setShowStudyScopeModal(false)}
        />
      )}

      {selectedWordDetail && (
        <WordDetailModal
          word={selectedWordDetail}
          attempts={attemptAnalytics}
          decks={decks}
          tags={tags}
          onSaveWord={(updatedWord) => {
            setWords((prev) => prev.map((w) => (w.id === updatedWord.id ? updatedWord : w)));
            setSelectedWordDetail(null);
            showToast(`Đã cập nhật từ "${updatedWord.word}" thành công!`);
          }}
          onClose={() => setSelectedWordDetail(null)}
        />
      )}
    </div>
  );
}
