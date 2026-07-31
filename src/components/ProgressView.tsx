import React, {useMemo, useState} from 'react';
import {BarChart3} from 'lucide-react';
import type {StudyScope, Word} from '../types';
import type {ProgressAttemptRow} from '../features/analytics/progressAnalytics';
import {calculateProgressAnalytics} from '../features/analytics/progressAnalytics';
import type {SentenceAnalytics} from '../features/analytics/sentenceAnalytics';

interface ProgressViewProps {
  words: Word[];
  studyScope?: StudyScope;
  attempts?: ProgressAttemptRow[];
  sentenceAnalytics?: SentenceAnalytics[];
}

const percentLabel = (value: number | null) => value === null ? '—' : `${value}%`;

export const ProgressView: React.FC<ProgressViewProps> = ({
  words,
  studyScope,
  attempts = [],
  sentenceAnalytics = [],
}) => {
  const [period, setPeriod] = useState<7 | 30 | 0>(0);
  const filteredAttempts = useMemo(() => {
    if (period === 0) return attempts;
    const cutoff = Date.now() - period * 86_400_000;
    return attempts.filter((attempt) => Date.parse(attempt.created_at) >= cutoff);
  }, [attempts, period]);
  const analytics = calculateProgressAnalytics(words, filteredAttempts, new Date(), 'Asia/Ho_Chi_Minh', studyScope);
  const currentStreak = (() => {
    let streak = 0;
    for (const day of [...analytics.activity].reverse()) {
      if (day.attempts === 0) break;
      streak += 1;
    }
    return streak;
  })();
  const sentenceText = new Map(
    words.flatMap((word) => word.meanings.flatMap((meaning) => (
      meaning.exampleSentences.map((example) => [example.id, example.sentence] as const)
    )))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-indigo-600" />
          <span>Thống kê tiến trình & Memory Analytics</span>
        </h1>
        <p className="text-slate-500 text-sm">FSRS cho biết khả năng nhớ dự đoán; lịch sử trả lời cho biết hiệu suất thực tế.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Khoảng thời gian:</span>
        {([[7, '7 ngày'], [30, '30 ngày'], [0, 'Toàn bộ']] as const).map(([value, label]) => (
          <button key={label} type="button" onClick={() => setPeriod(value)} className={`rounded-full px-3 py-1.5 text-xs font-bold border ${period === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>
        ))}
        <span className="ml-auto text-sm text-slate-500">Streak hiện tại: <strong className="text-slate-900">{currentStreak} ngày</strong></span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          ['Tổng số Learning Cards', `${analytics.totalCards}`, 'text-slate-900'],
          ['Khả năng nhớ dự đoán', percentLabel(analytics.predictedRetention), 'text-emerald-600'],
          ['Đúng lần đầu', percentLabel(analytics.firstAttemptAccuracy), 'text-indigo-600'],
          ['Độ chính xác tổng', percentLabel(analytics.overallAccuracy), 'text-rose-600'],
        ].map(([label, value, color]) => (
          <div key={label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <div className="text-xs text-slate-500 font-medium">{label}</div>
            <div className={`text-3xl font-extrabold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['Mới', analytics.stateCounts.new],
          ['Đang học', analytics.stateCounts.learning],
          ['Review', analytics.stateCounts.review],
          ['Học lại', analytics.stateCounts.relearning],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Hiệu suất trả lời</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          <div><div className="text-slate-500">Tỷ lệ retry</div><strong>{percentLabel(analytics.retryRate)}</strong></div>
          <div><div className="text-slate-500">Dùng hint</div><strong>{percentLabel(analytics.hintRate)}</strong></div>
          <div><div className="text-slate-500">Reveal đáp án</div><strong>{percentLabel(analytics.revealRate)}</strong></div>
          <div><div className="text-slate-500">Thời gian trả lời</div><strong>{analytics.averageResponseTimeMs === null ? '—' : `${(analytics.averageResponseTimeMs / 1000).toFixed(1)}s`}</strong></div>
          <div><div className="text-slate-500">Số lượt trả lời</div><strong>{filteredAttempts.length}</strong></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div><h2 className="text-lg font-bold text-slate-900">Hiệu suất theo câu</h2><p className="text-xs text-slate-500">Các câu khó nhất được xếp trước dựa trên tỷ lệ trả lời đúng.</p></div>
        {sentenceAnalytics.length === 0 ? <p className="text-sm text-slate-500">Chưa có dữ liệu câu để thống kê.</p> : <div className="space-y-3">{sentenceAnalytics.slice(0, 5).map((item) => <div key={item.sentenceKey} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-start justify-between gap-4"><p className="text-sm font-medium text-slate-800">{sentenceText.get(item.sentenceKey) ?? item.sentenceKey}</p><span className="shrink-0 text-sm font-bold text-rose-600">{item.accuracy}%</span></div><p className="mt-1 text-xs text-slate-500">{item.attempts} lần trả lời · Lần đầu đúng {item.firstAttemptCorrect}%{item.averageResponseTimeMs !== null ? ` · Trung bình ${Math.round(item.averageResponseTimeMs / 100) / 10}s` : ''}</p></div>)}</div>}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div><h2 className="text-lg font-bold text-slate-900">Learning Activity</h2><p className="text-xs text-slate-500">Số lần trả lời trong 7 ngày theo ngày học local (04:00).</p></div>
        <div className="grid grid-cols-7 items-end gap-2 h-32" aria-label="Biểu đồ hoạt động học tập 7 ngày">
          {analytics.activity.map((day) => { const max = Math.max(1, ...analytics.activity.map((item) => item.attempts)); return <div key={day.studyDate} className="flex h-full flex-col items-center justify-end gap-1"><span className="text-[10px] font-bold text-slate-600">{day.attempts}</span><div className="w-full rounded-t-lg bg-indigo-500" style={{height: `${Math.max(8, (day.attempts / max) * 88)}px`}} title={`${day.studyDate}: ${day.attempts} lần trả lời`} /><span className="text-[10px] text-slate-500">{new Intl.DateTimeFormat('vi-VN', {weekday: 'short'}).format(new Date(`${day.studyDate}T12:00:00Z`)).replace('.', '')}</span></div>; })}
        </div>
      </div>
    </div>
  );
};
