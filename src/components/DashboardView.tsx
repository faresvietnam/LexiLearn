import React, { useEffect, useState } from 'react';
import {
  Play,
  Sparkles,
  AlertTriangle,
  Clock,
  TrendingUp,
  Sliders,
  RotateCcw,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  BrainCircuit,
} from 'lucide-react';
import { Word, StudyScope, UserSettings, MemoryStrength } from '../types';
import {buildReviewForecast} from '../features/scheduling/reviewForecast';
import { formatReviewCountdown, isReviewDue, type ReviewCountdownState } from '../features/scheduling/reviewCountdown';
import { buildSessionQuestions } from '../utils/sessionBuilder';

interface DashboardViewProps {
  words: Word[];
  newWordsStartedToday?: number;
  studyScope: StudyScope;
  settings: UserSettings;
  isSessionStartPending: boolean;
  onStartLearning: (isExtraReview?: boolean) => void;
  onOpenStudyScope: () => void;
  onOpenFilteredVocabulary: (filter: { memoryStrength?: MemoryStrength }) => void;
  onPracticeWord: (wordId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  words,
  newWordsStartedToday = 0,
  studyScope,
  settings,
  isSessionStartPending,
  onStartLearning,
  onOpenStudyScope,
  onOpenFilteredVocabulary,
  onPracticeWord,
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  // Filter active words in Study Scope
  const activeWords = words.filter((w) => {
    if (w.status !== 'active') return false;
    if (studyScope.activeDeckIds.length > 0 && !studyScope.activeDeckIds.includes(w.deckId)) return false;
    const hasExcludedTag = w.tags.some((t) => studyScope.excludedTagIds.includes(t));
    if (hasExcludedTag) return false;
    if (studyScope.pausedWordIds.includes(w.id)) return false;
    return true;
  });

  // Calculate Memory Strength distributions across active meaning cards
  let strongCount = 0;
  let stableCount = 0;
  let weakCount = 0;
  let criticalCount = 0;

  let reviewsDueCount = 0;
  let atRiskCount = 0;

  const forgottenList: Array<{
    word: Word;
    meaning: string;
    strength: MemoryStrength;
    errorRate: number;
    forgottenParts: string[];
    nextReview: string;
  }> = [];

  activeWords.forEach((word) => {
    word.meanings.forEach((m) => {
      const isWeakOrCritical = m.memoryStrength === 'critical' || m.memoryStrength === 'weak';

      // FSRS state is the source of truth for new cards. Legacy cards without
      // persisted FSRS state continue through the existing review/at-risk flow.
      if (m.fsrsState === 0) {
      } else {
        if (isReviewDue(m.nextReviewDate, now, 'Asia/Ho_Chi_Minh')) {
          reviewsDueCount++;
        }
        if (isWeakOrCritical || (m.firstAttemptErrorRate && m.firstAttemptErrorRate >= 25)) {
          atRiskCount++;
          forgottenList.push({
            word,
            meaning: m.meaning,
            strength: m.memoryStrength,
            errorRate: m.firstAttemptErrorRate || 40,
            forgottenParts: m.forgottenWordParts || [],
            nextReview: m.nextReviewDate,
          });
        }
      }

      if (m.memoryStrength === 'strong') strongCount++;
      else if (m.memoryStrength === 'stable') stableCount++;
      else if (m.memoryStrength === 'weak') weakCount++;
      else if (m.memoryStrength === 'critical') criticalCount++;
    });
  });

  const totalMeaningCards = strongCount + stableCount + weakCount + criticalCount;

  // "Ôn lại sau" answers "when can I next start a session" — that requires
  // the same 5-distinct-card minimum buildSessionQuestions enforces, not
  // just whether any single card is due (which disagreed with the actual
  // start-session gate whenever due cards existed but fewer than 5 total).
  const newWordsLimitOverride = Math.max(0, settings.newWordsPerDay - newWordsStartedToday);
  const sessionPreview = buildSessionQuestions(words, studyScope, settings, false, newWordsLimitOverride);
  const nextReview: ReviewCountdownState = sessionPreview.insufficientCards
    ? sessionPreview.nextEligibleAt
      ? {
          kind: 'scheduled',
          target: new Date(sessionPreview.nextEligibleAt),
          remainingMs: Math.max(0, new Date(sessionPreview.nextEligibleAt).getTime() - now.getTime()),
        }
      : {kind: 'none'}
    : {kind: 'due'};
  const forecast = buildReviewForecast(words, studyScope, now, 'Asia/Ho_Chi_Minh');

  // Sort frequently forgotten words by error rate descending
  forgottenList.sort((a, b) => b.errorRate - a.errorRate);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 13.1 Today Overview Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-white p-6 md:p-8 border border-slate-200 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                Spaced Repetition System
              </span>
              <button
                id="btn-dash-scope"
                onClick={onOpenStudyScope}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 font-medium transition"
              >
                <Sliders className="w-3 h-3 text-indigo-600" />
                <span>Scope: {activeWords.length} từ active</span>
              </button>
            </div>

            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              Sẵn sàng học bài hôm nay!
            </h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Hệ thống tự động điều chỉnh độ khó và nhắc lại từ vựng đúng thời điểm dựa trên lịch sử nhớ từ của bạn.
            </p>

            {/* Metric Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Reviews Due</div>
                <div className="text-2xl font-bold text-emerald-600">{reviewsDueCount}</div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Forecast hôm nay</div>
                <div className="text-2xl font-bold text-amber-600">{forecast[0]?.count ?? 0}</div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Từ mới hôm nay</div>
                <div className="text-2xl font-bold text-indigo-600">
                  {newWordsStartedToday}/{settings.newWordsPerDay}
                </div>
                <div className="text-[11px] text-slate-500">
                  Còn lại: {Math.max(0, settings.newWordsPerDay - newWordsStartedToday)}
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">Ôn lại sau</div>
                <div className="text-2xl font-bold text-slate-800">{formatReviewCountdown(nextReview)}</div>
              </div>
            </div>
          </div>

          {/* Continue Learning Primary Button */}
          <div className="flex flex-col gap-3 min-w-[220px]">
            <button
              id="btn-continue-learning"
              disabled={isSessionStartPending}
              onClick={() => onStartLearning(false)}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-lg shadow-lg shadow-indigo-100 transition transform active:scale-[0.98]"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Continue Learning</span>
            </button>

            {reviewsDueCount >= settings.reviewLimitPerDay && (
              <button
                id="btn-extra-review"
                disabled={isSessionStartPending}
                onClick={() => onStartLearning(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed text-amber-800 font-semibold text-sm border border-amber-200 transition"
              >
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>Review more at-risk words</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid: 13.2 Memory Strength & 13.3 Review Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 13.2 Memory Strength Stacked Chart */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-600" />
              <span>Phân bố mức ghi nhớ (Memory Strength)</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">{totalMeaningCards} cards</span>
          </div>

          {/* Stacked Bar */}
          <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            {totalMeaningCards > 0 ? (
              <>
                <div
                  title={`Strong: ${strongCount}`}
                  style={{ width: `${(strongCount / totalMeaningCards) * 100}%` }}
                  className="bg-emerald-500 hover:bg-emerald-600 transition cursor-pointer"
                  onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'strong' })}
                />
                <div
                  title={`Stable: ${stableCount}`}
                  style={{ width: `${(stableCount / totalMeaningCards) * 100}%` }}
                  className="bg-blue-500 hover:bg-blue-600 transition cursor-pointer"
                  onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'stable' })}
                />
                <div
                  title={`Weak: ${weakCount}`}
                  style={{ width: `${(weakCount / totalMeaningCards) * 100}%` }}
                  className="bg-amber-500 hover:bg-amber-600 transition cursor-pointer"
                  onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'weak' })}
                />
                <div
                  title={`Critical: ${criticalCount}`}
                  style={{ width: `${(criticalCount / totalMeaningCards) * 100}%` }}
                  className="bg-rose-500 hover:bg-rose-600 transition cursor-pointer"
                  onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'critical' })}
                />
              </>
            ) : (
              <div className="w-full text-center text-xs text-slate-400 py-1">Chưa có dữ liệu</div>
            )}
          </div>

          {/* Interactive Legend Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <button
              onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'strong' })}
              className="p-3 rounded-2xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/80 text-left transition"
            >
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Strong (&gt;80%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{strongCount}</div>
            </button>

            <button
              onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'stable' })}
              className="p-3 rounded-2xl bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/80 text-left transition"
            >
              <div className="flex items-center gap-1.5 text-xs text-blue-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Stable (50-80%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{stableCount}</div>
            </button>

            <button
              onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'weak' })}
              className="p-3 rounded-2xl bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/80 text-left transition"
            >
              <div className="flex items-center gap-1.5 text-xs text-amber-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Weak (25-50%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{weakCount}</div>
            </button>

            <button
              onClick={() => onOpenFilteredVocabulary({ memoryStrength: 'critical' })}
              className="p-3 rounded-2xl bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200/80 text-left transition"
            >
              <div className="flex items-center gap-1.5 text-xs text-rose-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Critical (&lt;25%)</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">{criticalCount}</div>
            </button>
          </div>
        </div>

        {/* 13.3 Review Forecast */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <span>Dự kiến ôn tập (Review Forecast)</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">Limit: {settings.reviewLimitPerDay}/ngày</span>
          </div>

          <p className="text-xs text-slate-500">
            Dự báo số lượng từ cần ôn trong 7 ngày tới dựa trên chu kỳ phát triển bộ nhớ:
          </p>

          <div className="grid grid-cols-7 gap-2 pt-2">
            {forecast.map((f) => {
              const isOverLimit = f.count > settings.reviewLimitPerDay;
              return (
                <div
                  key={f.dateKey}
                  className={`rounded-2xl p-2.5 text-center border transition ${
                    f.isToday
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                      : isOverLimit
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-slate-50 border-slate-100 text-slate-700'
                  }`}
                >
                  <div className="text-[10px] font-semibold uppercase">{f.day}</div>
                  <div className="text-base font-bold mt-1">{f.count}</div>
                  {isOverLimit && (
                    <div className="text-[9px] text-rose-600 font-bold mt-0.5">High</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 13.4 Frequently Forgotten Words Table */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>Từ thường xuyên hay quên</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">Ưu tiên tỷ lệ sai trong 30 ngày qua</span>
        </div>

        {forgottenList.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 text-sm">
            Không có từ nào ở mức Critical/Weak! Tuyệt vời!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-3 px-4">Từ vựng</th>
                  <th className="py-3 px-4">Nghĩa chính</th>
                  <th className="py-3 px-4">Memory Strength</th>
                  <th className="py-3 px-4">Tỷ lệ sai lấn đầu</th>
                  <th className="py-3 px-4">Thành phần hay quên</th>
                  <th className="py-3 px-4">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forgottenList.slice(0, 5).map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{item.word.word}</td>
                    <td className="py-3.5 px-4 text-slate-700">{item.meaning}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          item.strength === 'critical'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {item.strength}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-rose-600">
                      {item.errorRate}%
                    </td>
                    <td className="py-3.5 px-4">
                      {item.forgottenParts.length > 0 ? (
                        <div className="flex gap-1">
                          {item.forgottenParts.map((p, i) => (
                            <span key={i} className="px-2 py-0.5 text-xs bg-rose-50 text-rose-700 font-semibold rounded-lg border border-rose-200">
                              -{p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Toàn bộ từ</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        disabled={isSessionStartPending}
                        onClick={() => onPracticeWord(item.word.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed text-indigo-700 font-bold text-xs border border-indigo-200 transition"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Practice</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
