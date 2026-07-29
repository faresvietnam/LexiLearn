import React, { useState, useMemo } from 'react';
import {
  BrainCircuit,
  Search,
  Filter,
  Play,
  AlertTriangle,
  BookOpen,
  Sparkles,
  ChevronRight,
  Layers,
  HelpCircle,
  Eye,
} from 'lucide-react';
import { Word, WordPart, WordPartType } from '../types';

interface RootWordInsightsViewProps {
  words: Word[];
  onPracticeWord: (wordId: string) => void;
  onOpenWordDetail?: (word: Word) => void;
}

interface ComponentSummary {
  text: string;
  type: WordPartType;
  meaning: string;
  associatedWords: Word[];
  forgottenCount: number;
}

export const RootWordInsightsView: React.FC<RootWordInsightsViewProps> = ({
  words,
  onPracticeWord,
  onOpenWordDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [showWeakOnly, setShowWeakOnly] = useState<boolean>(false);

  // Aggregate morphology components across all words
  const { componentMap, totalRoots, totalPrefixes, totalSuffixes, totalParts } = useMemo(() => {
    const map = new Map<string, ComponentSummary>();

    let rootsCount = 0;
    let prefixesCount = 0;
    let suffixesCount = 0;
    let partsCount = 0;

    words.forEach((w) => {
      // Collect forgotten parts for this word
      const forgottenPartsSet = new Set<string>();
      w.meanings?.forEach((m) => {
        m.forgottenWordParts?.forEach((fp) => forgottenPartsSet.add(fp.toLowerCase()));
      });

      w.wordStructure?.forEach((part) => {
        if (!part.text) return;
        const key = `${part.type}_${part.text.toLowerCase().trim()}`;
        partsCount++;

        if (!map.has(key)) {
          if (part.type === 'root') rootsCount++;
          if (part.type === 'prefix') prefixesCount++;
          if (part.type === 'suffix') suffixesCount++;

          map.set(key, {
            text: part.text.toLowerCase().trim(),
            type: part.type,
            meaning: part.meaning || 'Chưa cập nhật nghĩa',
            associatedWords: [w],
            forgottenCount: forgottenPartsSet.has(part.text.toLowerCase().trim()) ? 1 : 0,
          });
        } else {
          const existing = map.get(key)!;
          if (!existing.associatedWords.some((item) => item.id === w.id)) {
            existing.associatedWords.push(w);
          }
          if (forgottenPartsSet.has(part.text.toLowerCase().trim())) {
            existing.forgottenCount++;
          }
        }
      });
    });

    return {
      componentMap: map,
      totalRoots: rootsCount,
      totalPrefixes: prefixesCount,
      totalSuffixes: suffixesCount,
      totalParts: partsCount,
    };
  }, [words]);

  const componentsList = useMemo(() => {
    return Array.from(componentMap.values());
  }, [componentMap]);

  // High risk / forgotten parts calculation
  const topForgottenPrefixes = useMemo(() => {
    return componentsList
      .filter((c) => c.type === 'prefix')
      .sort((a, b) => b.forgottenCount - a.forgottenCount)
      .slice(0, 4);
  }, [componentsList]);

  const topForgottenRoots = useMemo(() => {
    return componentsList
      .filter((c) => c.type === 'root')
      .sort((a, b) => b.forgottenCount - a.forgottenCount)
      .slice(0, 4);
  }, [componentsList]);

  const topForgottenSuffixes = useMemo(() => {
    return componentsList
      .filter((c) => c.type === 'suffix')
      .sort((a, b) => b.forgottenCount - a.forgottenCount)
      .slice(0, 4);
  }, [componentsList]);

  // Filtered components list
  const filteredComponents = useMemo(() => {
    return componentsList.filter((comp) => {
      // Type filter
      if (selectedTypeFilter !== 'all' && comp.type !== selectedTypeFilter) {
        return false;
      }
      // Weak only filter
      if (showWeakOnly && comp.forgottenCount === 0) {
        return false;
      }
      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesText = comp.text.toLowerCase().includes(query);
        const matchesMeaning = comp.meaning.toLowerCase().includes(query);
        const matchesWords = comp.associatedWords.some((w) => w.word.toLowerCase().includes(query));
        return matchesText || matchesMeaning || matchesWords;
      }
      return true;
    });
  }, [componentsList, selectedTypeFilter, showWeakOnly, searchTerm]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-xl">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-xs font-bold uppercase tracking-wider">
            <BrainCircuit className="w-3.5 h-3.5 text-indigo-300" />
            Morphology Learning Engine
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Root Word & Morphology Insights
          </h1>
          <p className="text-sm text-indigo-200/90 leading-relaxed">
            Phân tích chuyên sâu cấu tạo từ (Tiền tố, Gốc từ, Hậu tố) giúp bạn ghi nhớ từ vựng theo bản chất ngữ nghĩa thay vì học thuộc lòng.
          </p>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end gap-3 shrink-0">
          <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center min-w-[120px]">
            <div className="text-xs text-indigo-200 uppercase font-semibold">Tổng số Gốc từ</div>
            <div className="text-2xl font-extrabold text-white mt-0.5">{totalRoots}</div>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Root Words (Gốc từ)</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalRoots}</div>
          <p className="text-xs text-slate-500">Chứa thông điệp cốt lõi của từ</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Prefixes (Tiền tố)</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalPrefixes}</div>
          <p className="text-xs text-slate-500">Đứng trước gốc từ làm đổi nghĩa</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Suffixes (Hậu tố)</span>
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalSuffixes}</div>
          <p className="text-xs text-slate-500">Quyết định từ loại (danh/tính/động/phó)</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Thành phần đã phân tích</span>
            <BrainCircuit className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalParts}</div>
          <p className="text-xs text-slate-500">Trong toàn bộ từ vựng cá nhân</p>
        </div>
      </div>

      {/* High-Risk Morphology Cards Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span>Cảnh báo thành phần thường xuyên hay quên</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Most Forgotten Prefixes */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                Tiền tố hay quên
              </span>
              <span className="text-xs font-mono font-bold text-slate-400">Prefixes</span>
            </div>

            {topForgottenPrefixes.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa phát hiện lỗi tiền tố.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {topForgottenPrefixes.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono font-extrabold text-slate-900 text-sm">
                        {item.text}-
                      </span>
                      <span className="text-xs text-slate-500 ml-2">({item.meaning})</span>
                    </div>
                    {item.forgottenCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">
                        {item.forgottenCount} lần quên
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">Ôn tốt</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most Forgotten Roots */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                Gốc từ hay quên
              </span>
              <span className="text-xs font-mono font-bold text-slate-400">Roots</span>
            </div>

            {topForgottenRoots.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa phát hiện lỗi gốc từ.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {topForgottenRoots.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono font-extrabold text-indigo-700 text-sm">
                        -{item.text}-
                      </span>
                      <span className="text-xs text-slate-500 ml-2">({item.meaning})</span>
                    </div>
                    {item.forgottenCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">
                        {item.forgottenCount} lần quên
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">Ôn tốt</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most Forgotten Suffixes */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                Hậu tố hay quên
              </span>
              <span className="text-xs font-mono font-bold text-slate-400">Suffixes</span>
            </div>

            {topForgottenSuffixes.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa phát hiện lỗi hậu tố.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {topForgottenSuffixes.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono font-extrabold text-slate-900 text-sm">
                        -{item.text}
                      </span>
                      <span className="text-xs text-slate-500 ml-2">({item.meaning})</span>
                    </div>
                    {item.forgottenCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">
                        {item.forgottenCount} lần quên
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">Ôn tốt</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tra cứu & Khám phá Gốc từ (Morphology Explorer) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Danh mục & Tra cứu Gốc từ</h2>
            <p className="text-xs text-slate-500 mt-1">
              Xem danh sách tất cả gốc từ, tiền tố và hậu tố cùng các từ vựng liên quan.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm gốc từ, nghĩa, từ vựng..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">Tất cả loại (All Parts)</option>
              <option value="prefix">Tiền tố (Prefix)</option>
              <option value="root">Gốc từ (Root)</option>
              <option value="suffix">Hậu tố (Suffix)</option>
              <option value="base">Từ nền (Base)</option>
            </select>

            <button
              onClick={() => setShowWeakOnly(!showWeakOnly)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                showWeakOnly
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {showWeakOnly ? 'Đang lọc: Thường hay quên' : 'Hiện cả từ đã thuộc'}
            </button>
          </div>
        </div>

        {/* Component Grid Cards */}
        {filteredComponents.length === 0 ? (
          <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-100 text-slate-500 text-sm space-y-2">
            <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <p>Không tìm thấy thành phần morphology nào phù hợp với bộ lọc!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredComponents.map((comp, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200 space-y-3 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-black text-indigo-700">
                        {comp.type === 'prefix'
                          ? `${comp.text}-`
                          : comp.type === 'suffix'
                          ? `-${comp.text}`
                          : comp.text}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          comp.type === 'root'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : comp.type === 'prefix'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {comp.type}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-700">{comp.meaning}</p>
                  </div>

                  {comp.forgottenCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                      {comp.forgottenCount} từ bị hay quên
                    </span>
                  )}
                </div>

                {/* Associated Words Pills */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Từ vựng sử dụng ({comp.associatedWords.length}):
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {comp.associatedWords.map((word) => (
                      <div
                        key={word.id}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs hover:border-indigo-300 transition"
                      >
                        <span
                          className="cursor-pointer hover:text-indigo-600"
                          onClick={() => onOpenWordDetail && onOpenWordDetail(word)}
                        >
                          {word.word}
                        </span>

                        <button
                          onClick={() => onPracticeWord(word.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          title="Luyện tập từ này"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
