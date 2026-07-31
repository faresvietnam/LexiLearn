import React from 'react';
import { BarChart3, TrendingUp, Award, CheckCircle, Clock, Zap } from 'lucide-react';
import { Word } from '../types';
import type {SentenceAnalytics} from '../features/analytics/sentenceAnalytics';

interface ProgressViewProps {
  words: Word[];
  sentenceAnalytics?: SentenceAnalytics[];
}

export const ProgressView: React.FC<ProgressViewProps> = ({ words, sentenceAnalytics = [] }) => {
  let totalCards = 0;
  let strongCards = 0;
  let totalErrorRate = 0;

  words.forEach((w) => {
    w.meanings.forEach((m) => {
      totalCards++;
      if (m.memoryStrength === 'strong') strongCards++;
      totalErrorRate += m.firstAttemptErrorRate || 0;
    });
  });

  const avgErrorRate = totalCards > 0 ? Math.round(totalErrorRate / totalCards) : 0;
  const retentionAccuracy = 100 - avgErrorRate;
  const partOfSpeechCounts = new Map<string, {total: number; errorRate: number}>();
  words.forEach((word) => word.meanings.forEach((meaning) => {
    const key = meaning.partOfSpeech || 'other';
    const current = partOfSpeechCounts.get(key) ?? {total: 0, errorRate: 0};
    current.total += 1;
    current.errorRate += meaning.firstAttemptErrorRate || 0;
    partOfSpeechCounts.set(key, current);
  }));
  const partOfSpeechRows = Array.from(partOfSpeechCounts, ([partOfSpeech, value]) => ({
    partOfSpeech,
    accuracy: Math.max(0, 100 - Math.round(value.errorRate / value.total)),
  })).sort((left, right) => right.accuracy - left.accuracy);
  const activity = Array.from({length: 7}, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    const dateKey = date.toISOString().slice(0, 10);
    const attempts = words.reduce((total, word) => total + word.meanings.reduce(
      (count, meaning) => count + meaning.history.filter((item) => item.date.slice(0, 10) === dateKey).length,
      0,
    ), 0);
    return {dateKey, label: new Intl.DateTimeFormat('vi-VN', {weekday: 'short'}).format(date).replace('.', ''), attempts};
  });
  const maxActivity = Math.max(1, ...activity.map(({attempts}) => attempts));
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
        <p className="text-slate-500 text-sm">Báo cáo chỉ số ghi nhớ và tỷ lệ phản hồi chính xác của bạn</p>
      </div>

      {/* Primary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-medium">Tổng số Learning Cards</div>
          <div className="text-3xl font-extrabold text-slate-900">{totalCards}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-medium">Tỷ lệ nhớ từ (Retention Rate)</div>
          <div className="text-3xl font-extrabold text-emerald-600">{retentionAccuracy}%</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-medium">Số thẻ đạt mức Strong</div>
          <div className="text-3xl font-extrabold text-indigo-600">{strongCards}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 font-medium">Tỷ lệ sai lần đầu trung bình</div>
          <div className="text-3xl font-extrabold text-rose-600">{avgErrorRate}%</div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-lg font-bold text-slate-900">Chỉ số thành thạo theo từ loại</h2>

        <div className="space-y-4 text-xs">
          {partOfSpeechRows.length === 0 ? (
            <p className="text-slate-500">Chưa có dữ liệu.</p>
          ) : partOfSpeechRows.map((row, index) => (
            <div key={row.partOfSpeech}>
              <div className="flex justify-between mb-1 text-slate-700 font-medium">
                <span>{row.partOfSpeech}</span>
                <span className={`font-bold ${index % 2 === 0 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                  {row.accuracy}%
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${index % 2 === 0 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                  style={{width: `${row.accuracy}%`}}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Hiệu suất theo câu</h2>
          <p className="text-xs text-slate-500">
            Các câu khó nhất được xếp trước dựa trên tỷ lệ trả lời đúng.
          </p>
        </div>
        {sentenceAnalytics.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có dữ liệu câu để thống kê.</p>
        ) : (
          <div className="space-y-3">
            {sentenceAnalytics.slice(0, 5).map((item) => (
              <div key={item.sentenceKey} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium text-slate-800">
                    {sentenceText.get(item.sentenceKey) ?? item.sentenceKey}
                  </p>
                  <span className="shrink-0 text-sm font-bold text-rose-600">{item.accuracy}%</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.attempts} lần trả lời · Lần đầu đúng {item.firstAttemptCorrect}%
                  {item.averageResponseTimeMs !== null
                    ? ` · Trung bình ${Math.round(item.averageResponseTimeMs / 100) / 10}s`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Learning Activity</h2>
          <p className="text-xs text-slate-500">Số lần trả lời trong 7 ngày gần nhất.</p>
        </div>
        <div className="grid grid-cols-7 items-end gap-2 h-32" aria-label="Biểu đồ hoạt động học tập 7 ngày">
          {activity.map((day) => (
            <div key={day.dateKey} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-bold text-slate-600">{day.attempts}</span>
              <div
                className="w-full rounded-t-lg bg-indigo-500"
                style={{height: `${Math.max(8, (day.attempts / maxActivity) * 88)}px`}}
                title={`${day.dateKey}: ${day.attempts} lần trả lời`}
              />
              <span className="text-[10px] text-slate-500">{day.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
