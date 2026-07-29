import React, { useState } from 'react';
import {Navigate, useLocation} from 'react-router-dom';
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
import { AdminApprovalView } from './components/AdminApprovalView';
import { RootWordInsightsView } from './components/RootWordInsightsView';
import { buildSessionQuestions } from './utils/sessionBuilder';

export default function App() {
  const {status, roles} = useAuth();
  const location = useLocation();
  if (status !== 'authenticated') return <LoginView />;
  const authenticatedRole: UserRole = roles.includes('admin') ? 'admin' : 'learner';
  if (location.pathname === '/admin' && authenticatedRole !== 'admin') return <Navigate to="/" replace />;
  // Main Application State
  const [words, setWords] = useState<Word[]>(INITIAL_WORDS);
  const [decks, setDecks] = useState<Deck[]>(INITIAL_DECKS);
  const [tags, setTags] = useState<Tag[]>(INITIAL_TAGS);
  const [studyScope, setStudyScope] = useState<StudyScope>(INITIAL_STUDY_SCOPE);
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const userRole = authenticatedRole;

  // Navigation State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Learning Session State
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [isExtraReviewSession, setIsExtraReviewSession] = useState<boolean>(false);

  // Modals & Overlay States
  const [showStudyScopeModal, setShowStudyScopeModal] = useState<boolean>(false);
  const [showAddWordModal, setShowAddWordModal] = useState<boolean>(false);
  const [showCsvImportModal, setShowCsvImportModal] = useState<boolean>(false);
  const [selectedWordDetail, setSelectedWordDetail] = useState<Word | null>(null);
  const [vocabularyMemoryFilter, setVocabularyMemoryFilter] = useState<MemoryStrength | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle User Role (Learner vs Admin)

  // Start Learning Session Builder
  const handleStartLearning = (isExtraReview: boolean = false) => {
    const session = buildSessionQuestions(words, studyScope, settings, isExtraReview);
    if (session.questions.length === 0) {
      showToast('Không có từ vựng nào cần học trong Study Scope hiện tại!');
      return;
    }
    setActiveQuestions(session.questions);
    setIsExtraReviewSession(isExtraReview);
    setIsSessionActive(true);
  };

  const handlePracticeSingleWord = (wordId: string) => {
    const targetWord = words.find((w) => w.id === wordId);
    if (!targetWord) return;

    const session = buildSessionQuestions([targetWord], studyScope, settings, true);
    if (session.questions.length > 0) {
      setActiveQuestions(session.questions);
      setIsExtraReviewSession(true);
      setIsSessionActive(true);
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
    setIsSessionActive(false);
    showToast(
      `Hoàn thành Session! Độ chính xác lần đầu: ${stats.firstAttemptAccuracy}% • Đã ôn ${stats.reviewsCompleted} card(s).`
    );
    setCurrentTab('dashboard');
  };

  // Vocabulary handlers
  const handleUpdateWordStatus = (wordId: string, status: WordStudyStatus) => {
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, status } : w))
    );
    showToast(`Đã cập nhật trạng thái từ sang: ${status}`);
  };

  const handleBulkUpdateStatus = (wordIds: string[], status: WordStudyStatus) => {
    setWords((prev) =>
      prev.map((w) => (wordIds.includes(w.id) ? { ...w, status } : w))
    );
    showToast(`Đã cập nhật ${wordIds.length} từ sang: ${status}`);
  };

  const handleAddWord = (newWord: Word) => {
    setWords((prev) => [newWord, ...prev]);
    showToast(`Đã thêm từ "${newWord.word}" vào danh sách học cá nhân!`);
  };

  const handleLinkExistingGlobalWord = (wordId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId
          ? {
              ...w,
              status: 'active',
            }
          : w
      )
    );
    showToast('Đã thêm từ Global Vocabulary vào danh sách học của bạn!');
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
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl bg-slate-900 text-white font-medium text-sm shadow-xl border border-slate-800 animate-bounce flex items-center gap-2">
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
          userRole={userRole}
          onOpenAdmin={() => setCurrentTab('admin_submissions')}
          onOpenStudyScope={() => setShowStudyScopeModal(true)}
          pendingSubmissionsCount={pendingSubmissionsCount}
        />
      )}

      {/* Main View Router */}
      {isSessionActive ? (
        <LearningSessionView
          questions={activeQuestions}
          settings={settings}
          isExtraReview={isExtraReviewSession}
          onMeaningCardUpdated={handleMeaningCardUpdated}
          onFinishSession={handleFinishSession}
          onExitSession={() => setIsSessionActive(false)}
        />
      ) : (
        <main className="md:ml-64 lg:ml-72 transition-all min-h-screen pb-12">
          {currentTab === 'dashboard' && (
            <DashboardView
              words={words}
              studyScope={studyScope}
              settings={settings}
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
                onClick={() => handleStartLearning(false)}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-xl shadow-md shadow-indigo-100 transition"
              >
                Bắt đầu phiên học
              </button>
            </div>
          )}

          {currentTab === 'rootword' && (
            <RootWordInsightsView
              words={words}
              onPracticeWord={handlePracticeSingleWord}
              onOpenWordDetail={(w) => setSelectedWordDetail(w)}
            />
          )}

          {currentTab === 'add_word' && (
            <AddWordModal
              decks={decks}
              tags={tags}
              existingWords={words}
              onAddWord={(newWord) => {
                handleAddWord(newWord);
                setCurrentTab('vocabulary');
              }}
              onLinkExistingGlobalWord={(id) => {
                handleLinkExistingGlobalWord(id);
                setCurrentTab('vocabulary');
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
              onBulkMoveDeck={(ids, deckId) => {
                setWords((prev) => prev.map((w) => (ids.includes(w.id) ? { ...w, deckId } : w)));
                showToast(`Đã chuyển ${ids.length} từ sang Deck mới.`);
              }}
            />
          )}

          {currentTab === 'decks_tags' && (
            <DecksAndTagsView
              decks={decks}
              tags={tags}
              words={words}
              onCreateDeck={(d) => setDecks([...decks, d])}
              onCreateTag={(t) => setTags([...tags, t])}
            />
          )}

          {currentTab === 'analytics' && <ProgressView words={words} />}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              studyScope={studyScope}
              words={words}
              onUpdateSettings={(s) => {
                setSettings(s);
                showToast('Đã cập nhật cài đặt!');
              }}
              onExportData={handleExportData}
            />
          )}

          {currentTab === 'admin_submissions' && userRole === 'admin' && (
            <AdminApprovalView
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
          onSaveScope={(newScope) => {
            setStudyScope(newScope);
            showToast('Đã lưu Study Scope mới làm mặc định!');
          }}
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
