import React, {useEffect, useState} from 'react';
import {Pencil, Trash2} from 'lucide-react';
import {SentenceCard} from '../types';
import type {SentenceCardInput} from '../features/persistence/sentenceRepository';
import {deriveSentenceMemoryStrength} from '../features/scheduling/sentenceRating';
import {formatRelativeDueTime} from '../features/scheduling/relativeDueTime';
import {playSentenceAudio} from '../utils/playSentenceAudio';
import {AddSentenceForm} from './AddSentenceForm';

const PAGE_SIZE = 20;

const LEARNING_STATUS_LABEL: Record<number, string> = {
  0: 'Mới',
  1: 'Đang học',
  2: 'Review',
  3: 'Học lại',
};

const MEMORY_STRENGTH_STYLE: Record<string, string> = {
  strong: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  stable: 'bg-blue-50 text-blue-700 border border-blue-200',
  weak: 'bg-amber-50 text-amber-700 border border-amber-200',
  critical: 'bg-rose-50 text-rose-700 border border-rose-200',
};

interface SentenceLibraryViewProps {
  sentenceCards: SentenceCard[];
  onEditSentenceCard: (id: string, input: SentenceCardInput) => Promise<boolean>;
  onDeleteSentenceCard: (card: SentenceCard) => Promise<boolean>;
}

export const SentenceLibraryView: React.FC<SentenceLibraryViewProps> = ({
  sentenceCards,
  onEditSentenceCard,
  onDeleteSentenceCard,
}) => {
  const [editingCard, setEditingCard] = useState<SentenceCard | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const sortedCards = [...sentenceCards].sort(
    (a, b) => Date.parse(a.nextReviewDate) - Date.parse(b.nextReviewDate),
  );
  const totalPages = Math.max(1, Math.ceil(sortedCards.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sortedCards.length);
  const pageCards = sortedCards.slice(pageStart, pageEnd);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Thư viện câu</h1>

      {sentenceCards.length === 0 ? (
        <p className="text-sm text-slate-500">
          Chưa có câu nào. Vào "Add data" để thêm câu mới.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pageCards.map((card) => {
              const memoryStrength = deriveSentenceMemoryStrength(card);
              return (
                <div
                  key={card.id}
                  data-testid="sentence-card"
                  onClick={() => playSentenceAudio(card.englishSentence, card.audioUrl)}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm cursor-pointer hover:border-indigo-300 hover:shadow-md transition"
                >
                  <img src={card.imageUrl} alt="" className="w-full h-32 object-cover" />
                  <div className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${MEMORY_STRENGTH_STYLE[memoryStrength]}`}
                      >
                        {memoryStrength}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {LEARNING_STATUS_LABEL[card.fsrsState]}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Ôn tiếp theo: {formatRelativeDueTime(card.nextReviewDate)}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{card.englishSentence}</p>
                    {card.ipa && (
                      <p className="text-xs text-indigo-600 font-mono">{card.ipa}</p>
                    )}
                    <p className="text-sm text-slate-500">{card.vietnameseSentence}</p>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingCard(card);
                        }}
                        aria-label={`Sửa câu: ${card.englishSentence}`}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleteSentenceCard(card);
                        }}
                        aria-label={`Xoá câu: ${card.englishSentence}`}
                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Hiển thị {pageStart + 1}–{pageEnd} / {sortedCards.length} câu
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
        </>
      )}

      {editingCard && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 overflow-y-auto">
          <AddSentenceForm
            initialCard={editingCard}
            onSave={(input) => onEditSentenceCard(editingCard.id, input)}
            onClose={() => setEditingCard(null)}
          />
        </div>
      )}
    </div>
  );
};
