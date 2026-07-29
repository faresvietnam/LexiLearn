import React from 'react';
import { BarChart3, TrendingUp, Award, CheckCircle, Clock, Zap } from 'lucide-react';
import { Word } from '../types';

interface ProgressViewProps {
  words: Word[];
}

export const ProgressView: React.FC<ProgressViewProps> = ({ words }) => {
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
          <div>
            <div className="flex justify-between mb-1 text-slate-700 font-medium">
              <span>Noun (Danh từ)</span>
              <span className="font-bold text-emerald-600">82%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[82%]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1 text-slate-700 font-medium">
              <span>Verb (Động từ)</span>
              <span className="font-bold text-indigo-600">74%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 w-[74%]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1 text-slate-700 font-medium">
              <span>Adjective (Tính từ)</span>
              <span className="font-bold text-amber-600">65%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 w-[65%]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
