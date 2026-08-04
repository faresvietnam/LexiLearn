import React, { useState } from 'react';
import { Settings as SettingsIcon, Sliders, Download, Keyboard, KeyRound, Volume2 } from 'lucide-react';
import { UserSettings, StudyScope, Word } from '../types';
import type {
  SaveAiProviderSettingsInput,
} from '../features/persistence/settingsRepository';
import {normalizeOpenAICompatibleBaseUrl} from '../features/openai/openAICompatibleClient';

interface SettingsViewProps {
  settings: UserSettings;
  studyScope: StudyScope;
  words: Word[];
  onUpdateSettings: (newSettings: UserSettings) => Promise<boolean>;
  onSaveGeminiApiKey?: (apiKey: string | null) => Promise<boolean>;
  onSaveAiProviderSettings?: (
    providerSettings: SaveAiProviderSettingsInput,
  ) => Promise<boolean>;
  onExportData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  studyScope,
  words,
  onUpdateSettings,
  onSaveGeminiApiKey,
  onSaveAiProviderSettings,
  onExportData,
}) => {
  const [newWordsLimit, setNewWordsLimit] = useState(settings.newWordsPerDay);
  const [reviewLimit, setReviewLimit] = useState(settings.reviewLimitPerDay);
  const [audioAutoplay, setAudioAutoplay] = useState(settings.audioAutoplay);
  const [reducedMotion, setReducedMotion] = useState(settings.reducedMotion);
  const [charDiffAcc, setCharDiffAcc] = useState(settings.charDiffAccessibility);
  const [isSaving, setIsSaving] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(
    settings.geminiApiKey ?? '',
  );
  const [isGeminiSaving, setIsGeminiSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState(settings.aiProvider);
  const [openAIBaseUrl, setOpenAIBaseUrl] = useState(
    settings.openAICompatibleBaseUrl,
  );
  const [openAIToken, setOpenAIToken] = useState('');
  const [openAIModel, setOpenAIModel] = useState(
    settings.openAICompatibleModel,
  );
  const [providerError, setProviderError] = useState<string | null>(null);

  const handleSaveGeminiApiKey = async () => {
    const normalizedKey = geminiApiKey.trim();
    if (!normalizedKey) return;
    setIsGeminiSaving(true);
    try {
      const saved = onSaveAiProviderSettings
        ? await onSaveAiProviderSettings({
            aiProvider: 'gemini',
            geminiApiKey: normalizedKey,
            openAICompatibleBaseUrl: openAIBaseUrl,
            openAICompatibleTokenConfigured:
              settings.openAICompatibleTokenConfigured,
            openAICompatibleModel: openAIModel,
          })
        : await onSaveGeminiApiKey?.(normalizedKey);
      if (saved) setGeminiApiKey(normalizedKey);
    } finally {
      setIsGeminiSaving(false);
    }
  };

  const handleRemoveGeminiApiKey = async () => {
    setIsGeminiSaving(true);
    try {
      const removed = onSaveAiProviderSettings
        ? await onSaveAiProviderSettings({
            aiProvider: 'gemini',
            geminiApiKey: null,
            openAICompatibleBaseUrl: openAIBaseUrl,
            openAICompatibleTokenConfigured:
              settings.openAICompatibleTokenConfigured,
            openAICompatibleModel: openAIModel,
          })
        : await onSaveGeminiApiKey?.(null);
      if (removed) setGeminiApiKey('');
    } finally {
      setIsGeminiSaving(false);
    }
  };

  const handleSaveOpenAICompatible = async () => {
    setProviderError(null);
    let normalizedBaseUrl: string;
    try {
      normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(openAIBaseUrl);
    } catch (error) {
      setProviderError(error instanceof Error
        ? error.message
        : 'Base URL OpenAI-compatible không hợp lệ.');
      return;
    }
    const token = openAIToken.trim();
    const model = openAIModel.trim();
    if ((!token && !settings.openAICompatibleTokenConfigured) || !model) {
      setProviderError('Vui lòng nhập đầy đủ token và model.');
      return;
    }
    setIsGeminiSaving(true);
    try {
      const saved = await onSaveAiProviderSettings?.({
        aiProvider: 'openai-compatible',
        geminiApiKey: geminiApiKey.trim() || null,
        openAICompatibleBaseUrl: normalizedBaseUrl,
        openAICompatibleTokenConfigured:
          settings.openAICompatibleTokenConfigured,
        ...(token ? {openAICompatibleToken: token} : {}),
        openAICompatibleModel: model,
      });
      if (saved) {
        setAiProvider('openai-compatible');
        setOpenAIBaseUrl(normalizedBaseUrl);
        setOpenAIToken('');
        setOpenAIModel(model);
      }
    } finally {
      setIsGeminiSaving(false);
    }
  };

  const handleRemoveOpenAIToken = async () => {
    setIsGeminiSaving(true);
    try {
      const saved = await onSaveAiProviderSettings?.({
        aiProvider,
        geminiApiKey: geminiApiKey.trim() || null,
        openAICompatibleBaseUrl: openAIBaseUrl.trim().replace(/\/+$/, ''),
        openAICompatibleTokenConfigured:
          settings.openAICompatibleTokenConfigured,
        openAICompatibleToken: null,
        openAICompatibleModel: openAIModel.trim(),
      });
      if (saved) setOpenAIToken('');
    } finally {
      setIsGeminiSaving(false);
    }
  };

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

        {/* AI PROVIDER */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            <span>Nhà cung cấp AI Auto-Fill</span>
          </h2>
          <div className="space-y-1">
            <label htmlFor="ai-provider" className="text-xs font-bold text-slate-700">
              Nhà cung cấp AI
            </label>
            <select
              id="ai-provider"
              value={aiProvider}
              onChange={(event) => {
                setAiProvider(event.target.value as UserSettings['aiProvider']);
                setProviderError(null);
              }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
            >
              <option value="gemini">Gemini</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </div>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Token được đồng bộ qua Supabase và được gửi trực tiếp từ trình duyệt.
            Hãy dùng token có thể thu hồi và giới hạn hạn mức.
          </p>
          {aiProvider === 'gemini' ? (
            <>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 space-y-1.5">
            <p className="font-bold">Cách lấy Gemini API key:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>
                Mở{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline hover:text-indigo-700"
                >
                  Google AI Studio → API keys
                </a>
                .
              </li>
              <li>Đăng nhập tài khoản Google và chọn <strong>Create API key</strong>.</li>
              <li>Sao chép key rồi dán vào ô bên dưới và bấm <strong>Lưu</strong>.</li>
            </ol>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="gemini-api-key"
              className="text-xs font-bold text-slate-700"
            >
              Gemini API key
            </label>
            <input
              id="gemini-api-key"
              type="password"
              autoComplete="off"
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
              placeholder="Dán Gemini API key của bạn"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:bg-white focus:border-indigo-500 transition"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isGeminiSaving || !geminiApiKey.trim()}
              onClick={() => void handleSaveGeminiApiKey()}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs disabled:opacity-60"
            >
              Lưu Gemini API key
            </button>
            <button
              type="button"
              disabled={isGeminiSaving || !settings.geminiApiKey}
              onClick={() => void handleRemoveGeminiApiKey()}
              className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs disabled:opacity-60"
            >
              Xóa Gemini API key
            </button>
          </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor="openai-base-url" className="text-xs font-bold text-slate-700">
                  Base URL
                </label>
                <input
                  id="openai-base-url"
                  type="url"
                  value={openAIBaseUrl}
                  onChange={(event) => setOpenAIBaseUrl(event.target.value)}
                  placeholder="https://openai.com/v1"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                {settings.openAICompatibleTokenConfigured && (
                  <p className="text-xs text-emerald-700">
                    Đã lưu token. Nhập token mới chỉ khi muốn thay thế.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor="openai-token" className="text-xs font-bold text-slate-700">
                  Token
                </label>
                <input
                  id="openai-token"
                  type="password"
                  autoComplete="off"
                  value={openAIToken}
                  onChange={(event) => setOpenAIToken(event.target.value)}
                  placeholder="Nhập Bearer token"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="openai-model" className="text-xs font-bold text-slate-700">
                  Model
                </label>
                <input
                  id="openai-model"
                  value={openAIModel}
                  onChange={(event) => setOpenAIModel(event.target.value)}
                  placeholder="gpt5.5"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
              {providerError && (
                <p role="alert" className="text-xs text-rose-700">
                  {providerError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isGeminiSaving}
                  onClick={() => void handleSaveOpenAICompatible()}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs disabled:opacity-60"
                >
                  Lưu cấu hình OpenAI-compatible
                </button>
                <button
                  type="button"
                  disabled={
                    isGeminiSaving
                    || !settings.openAICompatibleTokenConfigured
                  }
                  onClick={() => void handleRemoveOpenAIToken()}
                  className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs disabled:opacity-60"
                >
                  Xóa token OpenAI-compatible
                </button>
              </div>
            </>
          )}
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
