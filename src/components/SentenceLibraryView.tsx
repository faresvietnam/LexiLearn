import React, {useState} from 'react';
import {Pencil, Trash2} from 'lucide-react';
import {SentenceCard} from '../types';
import type {SentenceCardInput} from '../features/persistence/sentenceRepository';
import {AddSentenceForm} from './AddSentenceForm';

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Thư viện câu</h1>

      {sentenceCards.length === 0 ? (
        <p className="text-sm text-slate-500">
          Chưa có câu nào. Vào "Add data" để thêm câu mới.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sentenceCards.map((card) => (
            <div
              key={card.id}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
            >
              <img src={card.imageUrl} alt="" className="w-full h-32 object-cover" />
              <div className="p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-900">{card.englishSentence}</p>
                <p className="text-sm text-slate-500">{card.vietnameseSentence}</p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingCard(card)}
                    aria-label={`Sửa câu: ${card.englishSentence}`}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteSentenceCard(card)}
                    aria-label={`Xoá câu: ${card.englishSentence}`}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
