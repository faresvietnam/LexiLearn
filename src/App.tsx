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
import { AddWordModal } from './components/AddWordModal';
import { CsvImportModal } from './components/CsvImportModal';
import { DecksAndTagsView } from './components/DecksAndTagsView';
import { StudyScopeModal } from './components/StudyScopeModal';
import { ProgressView } from './components/ProgressView';
import { SettingsView } from './components/SettingsView';
import { AdminWorkspace } from './components/AdminWorkspace';
import { RootWordInsightsView } from './components/RootWordInsightsView';
import { buildSessionQuestions } from './utils/sessionBuilder';
import {getSupabaseClient} from './lib/supabase';
import {
  saveGeminiApiKey,
  saveSettings,
  saveStudyScope,
} from './features/persistence/settingsRepository';
import {
  completeStudySession,
  createStudySession,
  getLearningCardSchedule,
  pauseStudySession,
  recordStudyAttempt,
  updateLearningCardSchedule,
} from './features/persistence/sessionRepository';
import type {AutomaticRating} from './features/scheduling/automaticRating';
import {
  scheduleCard,
  type ScheduledLearningCard,
} from './features/scheduling/fsrsScheduler';
import {
  createPrivateWord,
  linkGlobalWord,
  loadLearnerState,
  moveWordsToDeck,
  saveDeck,
  saveTag,
  saveWordStatus,
  saveWordStatuses,
} from './features/persistence/vocabularyRepository';

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

  // Modals & Overlay States
  const [showStudyScopeModal, setShowStudyScopeModal] = useState<boolean>(false);
  const [showAddWordModal, setShowAddWordModal] = useState<boolean>(false);
  const [showCsvImportModal, setShowCsvImportModal] = useState<boolean>(false);
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

    return () => {
      alive = false;
    };
  }, [client, hydrationVersion, user?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
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
    const {questions} = buildSessionQuestions(
      words,
      studyScope,
      settings,
      isExtraReview,
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
    const result = await recordStudyAttempt(
      user.id,
      activeSessionId,
      attempt,
    );
    if (result.error) showToast(result.error);
  };

  const handleReviewCompleted = async (
    learningCardId: string,
    rating: AutomaticRating,
    reviewedAt: Date,
  ): Promise<ScheduledLearningCard | null> => {
    if (!client || !user) return null;

    try {
      const current = await getLearningCardSchedule(user.id, learningCardId);
      if (current.error) {
        showToast(current.error);
        return null;
      }

      const scheduled = scheduleCard(current.data, rating, reviewedAt);
      const next = scheduled.persistence;
      setWords((previous) => previous.map((word) => ({
        ...word,
        meanings: word.meanings.map((card) => card.id === learningCardId
          ? {
              ...card,
              memoryScore: next.memory_score,
              memoryStrength: next.memory_strength,
              reviewIntervalDays: next.review_interval_days,
              nextReviewDate: next.next_review_at,
              lastReviewedDate: next.last_reviewed_at ?? undefined,
            }
          : card),
      })));

      try {
        void updateLearningCardSchedule(
          user.id,
          learningCardId,
          next,
        ).then((result) => {
          if (result.error) showToast(result.error);
        }).catch(() => {
          showToast('Không thể lưu lịch ôn tập. Tiến trình cục bộ vẫn được giữ.');
        });
      } catch {
        showToast('Không thể lưu lịch ôn tập. Tiến trình cục bộ vẫn được giữ.');
      }

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

  const handleAddWord = async (newWord: Word) => {
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

  const handleCreateDeck = async (deck: Deck) => {
    let savedDeck = deck;
    if (client && user) {
      const result = await saveDeck(user.id, deck);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      savedDeck = result.data;
    }
    setDecks((prev) => [...prev, savedDeck]);
    showToast(`Đã tạo Deck "${savedDeck.name}".`);
    return true;
  };

  const handleCreateTag = async (tag: Tag) => {
    let savedTag = tag;
    if (client && user) {
      const result = await saveTag(user.id, tag);
      if (result.error) {
        showToast(result.error);
        return false;
      }
      savedTag = result.data;
    }
    setTags((prev) => [...prev, savedTag]);
    showToast(`Đã tạo Tag "${savedTag.name}".`);
    return true;
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

  const handleConfirmCsvImport = (importedWords: Word[]) => {
    setWords((prev) => [...importedWords, ...prev]);
    showToast(`Đã import thành công ${importedWords.length} từ vựng từ CSV!`);
  };

  // Admin Approval Handlers
  const handleApproveWord = (wordId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId
          ? {
              ...w,
              isGlobal: true,
              approvalStatus: 'approved',
            }
          : w
      )
    );
    showToast('Đã duyệt và gộp từ vào Global Vocabulary!');
  };

  const handleRejectWord = (wordId: string, reason: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId
          ? {
              ...w,
              approvalStatus: 'rejected',
              rejectionReason: reason,
            }
          : w
      )
    );
    showToast('Đã từ chối từ vựng.');
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

  const pendingSubmissionsCount = words.filter((w) => w.approvalStatus === 'pending').length;

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
          pendingSubmissionsCount={pendingSubmissionsCount}
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
              geminiApiKey={settings.geminiApiKey}
              onAddWord={async (newWord) => {
                const saved = await handleAddWord(newWord);
                if (saved) setCurrentTab('vocabulary');
                return saved;
              }}
              onLinkExistingGlobalWord={async (id) => {
                const saved = await handleLinkExistingGlobalWord(id);
                if (saved) setCurrentTab('vocabulary');
                return saved;
              }}
              onClose={() => setCurrentTab('vocabulary')}
            />
          )}

          {currentTab === 'import_csv' && (
            <CsvImportModal
              existingWords={words}
              onConfirmImport={(newWords) => {
                handleConfirmCsvImport(newWords);
                setCurrentTab('vocabulary');
              }}
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

          {currentTab === 'analytics' && <ProgressView words={words} />}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              studyScope={studyScope}
              words={words}
              onUpdateSettings={handleUpdateSettings}
              onSaveGeminiApiKey={handleSaveGeminiApiKey}
              onExportData={handleExportData}
            />
          )}

          {currentTab === 'admin' && userRole === 'admin' && (
            <AdminWorkspace
              words={words}
              onApproveWord={handleApproveWord}
              onRejectWord={handleRejectWord}
              onMergeWithGlobal={handleApproveWord}
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
