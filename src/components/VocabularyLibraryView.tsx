import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  CheckSquare,
  Square,
  MoreVertical,
  Pause,
  Play,
  Archive,
  MoveRight,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Globe,
  Tag as TagIcon,
  Folder,
} from 'lucide-react';
import { Word, Deck, Tag, MemoryStrength, WordStudyStatus } from '../types';

const PAGE_SIZE = 20;

const getEarliestReviewTime = (word: Word): number | null => {
  const validTimes = word.meanings
    .map(({nextReviewDate}) => Date.parse(nextReviewDate))
    .filter(Number.isFinite);

  return validTimes.length > 0 ? Math.min(...validTimes) : null;
};

interface VocabularyLibraryViewProps {
  words: Word[];
  decks: Deck[];
  tags: Tag[];
  initialMemoryFilter?: MemoryStrength | null;
  onOpenAddWordModal: () => void;
  onOpenWordDetail: (word: Word) => void;
  onUpdateWordStatus: (wordId: string, status: WordStudyStatus) => Promise<boolean>;
  onBulkUpdateStatus: (wordIds: string[], status: WordStudyStatus) => Promise<boolean>;
  onBulkMoveDeck: (wordIds: string[], deckId: string) => Promise<boolean>;
  onDeleteWord: (word: Word) => Promise<boolean>;
}

export const VocabularyLibraryView: React.FC<VocabularyLibraryViewProps> = ({
  words,
  decks,
  tags,
  initialMemoryFilter,
  onOpenAddWordModal,
  onOpenWordDetail,
  onUpdateWordStatus,
  onBulkUpdateStatus,
  onBulkMoveDeck,
  onDeleteWord,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeck, setSelectedDeck] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [memoryFilter, setMemoryFilter] = useState<string>(initialMemoryFilter || 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Bulk selection
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);

  // Filter logic
  const newUnlearnedCount = words.filter((word) =>
    word.meanings.some(
      ({learningStatus, fsrsState}) => learningStatus === 'new' || fsrsState === 0,
    ),
  ).length;

  const filteredWords = words.filter((word) => {
    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchWord = word.word.toLowerCase().includes(term);
      const matchMeaning = word.meanings.some((m) => m.meaning.toLowerCase().includes(term));
      if (!matchWord && !matchMeaning) return false;
    }

    // Deck
    if (selectedDeck !== 'all' && word.deckId !== selectedDeck) return false;

    // Tag
    if (selectedTag !== 'all' && !word.tags.includes(selectedTag)) return false;

    // Status
    if (statusFilter !== 'all' && word.status !== statusFilter) return false;

    // Memory Strength (checks primary meaning card)
    if (memoryFilter !== 'all') {
      const hasMatchingStrength = word.meanings.some((m) => m.memoryStrength === memoryFilter);
      if (!hasMatchingStrength) return false;
    }

    return true;
  });

  const sortedWords = filteredWords
    .map((word, index) => ({word, index, reviewTime: getEarliestReviewTime(word)}))
    .sort((left, right) => {
      if (left.reviewTime === null && right.reviewTime === null) {
        return left.index - right.index;
      }
      if (left.reviewTime === null) return 1;
      if (right.reviewTime === null) return -1;
      return left.reviewTime - right.reviewTime || left.index - right.index;
    })
    .map(({word}) => word);

  const totalPages = Math.max(1, Math.ceil(sortedWords.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sortedWords.length);
  const pageWords = sortedWords.slice(pageStart, pageEnd);
  const pageWordIds = pageWords.map(({id}) => id);
  const isCurrentPageSelected =
    pageWordIds.length > 0 && pageWordIds.every((id) => selectedWordIds.includes(id));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const toggleSelectAll = () => {
    if (isCurrentPageSelected) {
      setSelectedWordIds((ids) => ids.filter((id) => !pageWordIds.includes(id)));
    } else {
      setSelectedWordIds((ids) => [...new Set([...ids, ...pageWordIds])]);
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedWordIds.includes(id)) {
      setSelectedWordIds(selectedWordIds.filter((i) => i !== id));
    } else {
      setSelectedWordIds([...selectedWordIds, id]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Thư viện từ vựng (Vocabulary Library)</h1>
          <p className="text-slate-500 text-sm">
            Quản lý toàn bộ {words.length} từ vựng cá nhân và Global Vocabulary
          </p>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2">
          <span className="text-sm font-semibold text-indigo-700">
            Từ mới chưa học: {newUnlearnedCount}
          </span>
        </div>

        <button
          id="btn-add-word-header"
          onClick={onOpenAddWordModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Thêm từ mới</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm kiếm theo từ hoặc nghĩa Tiếng Việt..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          {/* Deck Select */}
          <select
            value={selectedDeck}
            onChange={(e) => {
              setSelectedDeck(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tất cả Deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Tag Select */}
          <select
            value={selectedTag}
            onChange={(e) => {
              setSelectedTag(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tất cả Tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Memory Strength Select */}
          <select
            value={memoryFilter}
            onChange={(e) => {
              setMemoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Mọi Memory Strength</option>
            <option value="strong">Strong</option>
            <option value="stable">Stable</option>
            <option value="weak">Weak</option>
            <option value="critical">Critical</option>
          </select>

        </div>

        {/* Bulk Action Controls */}
        {selectedWordIds.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex items-center gap-3 text-xs bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-800">
              Đã chọn {selectedWordIds.length} từ
            </span>
            <div className="h-4 w-px bg-indigo-200" />
            <button
              onClick={() => void onBulkUpdateStatus(selectedWordIds, 'active')}
              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-indigo-600"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
            <button
              onClick={() => void onBulkUpdateStatus(selectedWordIds, 'paused')}
              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-amber-600"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
            <button
              onClick={() => void onBulkUpdateStatus(selectedWordIds, 'archived')}
              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          </div>
        )}
      </div>

      {/* Vocabulary Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-3.5 px-4 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Chọn tất cả từ trên trang này"
                  >
                    {isCurrentPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">Từ vựng</th>
                <th className="py-3.5 px-4">Số Nghĩa</th>
                <th className="py-3.5 px-4">Deck</th>
                <th className="py-3.5 px-4">Memory Strength</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Không tìm thấy từ vựng khớp với bộ lọc!
                  </td>
                </tr>
              ) : (
                pageWords.map((word) => {
                  const isSelected = selectedWordIds.includes(word.id);
                  const primaryMeaning = word.meanings[0];
                  const deck = decks.find((d) => d.id === word.deckId);

                  return (
                    <tr
                      key={word.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => toggleSelectOne(word.id)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => onOpenWordDetail(word)}
                        >
                          <span className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition">
                            <span data-testid="vocabulary-word">{word.word}</span>
                          </span>
                          {word.isGlobal ? (
                            <Globe className="w-3.5 h-3.5 text-indigo-600" title="Global Word" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-amber-500" title="Private Word" />
                          )}
                        </div>
                        {word.ipa && <div className="text-xs font-mono text-slate-400">{word.ipa}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-xs font-mono text-slate-600">
                          {word.meanings.length} card(s)
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {deck && (
                          <span
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-800 border"
                            style={{
                              borderColor: `${deck.color}40`,
                              backgroundColor: `${deck.color}15`,
                            }}
                          >
                            {deck.name}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {primaryMeaning && (
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                primaryMeaning.memoryStrength === 'strong'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : primaryMeaning.memoryStrength === 'stable'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : primaryMeaning.memoryStrength === 'weak'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {primaryMeaning.memoryStrength}
                            </span>
                            {primaryMeaning.learningStatus && (
                              <span className="text-[11px] font-semibold text-slate-500">
                                {{new: 'Mới', learning: 'Đang học', review: 'Review', relearning: 'Học lại'}[primaryMeaning.learningStatus]}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              void onUpdateWordStatus(
                                word.id,
                                word.status === 'paused' ? 'active' : 'paused'
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                              word.status === 'active'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {word.status === 'active' ? 'Active' : 'Paused'}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onOpenWordDetail(word)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-xs font-semibold transition flex items-center gap-1"
                            title="Xem & Sửa từ vựng"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Chi tiết / Edit</span>
                          </button>
                          <button
                            onClick={() => void onDeleteWord(word)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition flex items-center gap-1"
                            title="Xoá vĩnh viễn"
                            aria-label={`Xoá ${word.word}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xoá</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {sortedWords.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Hiển thị {pageStart + 1}–{pageEnd} / {sortedWords.length} từ
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Trang trước"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Trước
              </button>
              <span className="font-semibold text-slate-700">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
