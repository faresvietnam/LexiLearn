import React, { useState } from 'react';
import { Settings as SettingsIcon, Sliders, Monitor, User, Download, Keyboard, Volume2 } from 'lucide-react';
import { UserSettings, StudyScope, Word } from '../types';

interface SettingsViewProps {
  settings: UserSettings;
  studyScope: StudyScope;
  words: Word[];
  onUpdateSettings: (newSettings: UserSettings) => Promise<boolean>;
  onExportData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  studyScope,
  words,
  onUpdateSettings,
  onExportData,
}) => {
  const [newWordsLimit, setNewWordsLimit] = useState(settings.newWordsPerDay);
  const [reviewLimit, setReviewLimit] = useState(settings.reviewLimitPerDay);
  const [audioAutoplay, setAudioAutoplay] = useState(settings.audioAutoplay);
  const [reducedMotion, setReducedMotion] = useState(settings.reducedMotion);
  const [charDiffAcc, setCharDiffAcc] = useState(settings.charDiffAccessibility);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdateSettings({
        ...settings,
        newWordsPerDay: newWordsLimit,
        reviewLimitPerDay: reviewLimit,
        audioAutoplay,
        reducedMotion,
        charDiffAccessibility: charDiffAcc,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-indigo-600" />
          <span>Cài đặt hệ thống (Settings)</span>
        </h1>
        <p className="text-slate-500 text-sm">Tùy chỉnh giới hạn học tập, giao diện và lối tắt bàn phím</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* LEARNING LIMITS */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <span>Cấu hình giới hạn học hàng ngày (Daily Limits)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">New Words Per Day (Từ mới mỗi ngày)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={newWordsLimit}
                onChange={(e) => setNewWordsLimit(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:bg-white focus:border-indigo-500 transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Review Limit Per Day (Giới hạn ôn tập từ cũ)</label>
              <input
                type="number"
                min={5}
                max={200}
                value={reviewLimit}
                onChange={(e) => setReviewLimit(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:bg-white focus:border-indigo-500 transition"
              />
            </div>
          </div>
        </div>

        {/* AUDIO & ACCESSIBILITY */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-indigo-600" />
            <span>Âm thanh & Khả năng truy cập (Accessibility)</span>
          </h2>

          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <span className="text-slate-700 font-medium">Tự động phát âm thanh khi trả lời đúng (Audio Autoplay)</span>
              <input
                type="checkbox"
                checked={audioAutoplay}
                onChange={(e) => setAudioAutoplay(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <span className="text-slate-700 font-medium">Hiển thị Accessible Character Diff (Gạch chân & Marker cho màu sắc)</span>
              <input
                type="checkbox"
                checked={charDiffAcc}
                onChange={(e) => setCharDiffAcc(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <span className="text-slate-700 font-medium">Chế độ giảm chuyển động (Reduced Motion)</span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* KEYBOARD SHORTCUTS CHEAT SHEET */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-indigo-600" />
            <span>Lối tắt bàn phím (Keyboard Shortcuts Help)</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <span className="font-mono text-indigo-600 font-bold">Enter:</span> Check hoặc Continue
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <span className="font-mono text-indigo-600 font-bold">1 - 9:</span> Chọn đáp án MC
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <span className="font-mono text-indigo-600 font-bold">H:</span> Mở gợi ý (Hint)
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <span className="font-mono text-indigo-600 font-bold">P:</span> Phát âm thanh
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <span className="font-mono text-indigo-600 font-bold">Escape:</span> Mở Pause Menu
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <span className="font-mono text-indigo-600 font-bold">Backspace:</span> Xóa Word Part
            </div>
          </div>
        </div>

        {/* EXPORT DATA */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Xuất dữ liệu học cá nhân (Export JSON)</h3>
            <p className="text-xs text-slate-500">Tải xuống toàn bộ lịch sử SRS, từ vựng và tiến trình của bạn</p>
          </div>
          <button
            type="button"
            onClick={onExportData}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export Data</span>
          </button>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base rounded-xl transition shadow-md shadow-indigo-100 disabled:opacity-60"
        >
          {isSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
      </form>
    </div>
  );
};
