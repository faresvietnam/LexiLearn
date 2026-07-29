import React, { useState } from 'react';
import { X, Sliders, Check, Folder, Tag as TagIcon, PauseCircle } from 'lucide-react';
import { StudyScope, Deck, Tag, Word } from '../types';

interface StudyScopeModalProps {
  studyScope: StudyScope;
  decks: Deck[];
  tags: Tag[];
  words: Word[];
  onSaveScope: (newScope: StudyScope) => Promise<boolean>;
  onClose: () => void;
}

export const StudyScopeModal: React.FC<StudyScopeModalProps> = ({
  studyScope,
  decks,
  tags,
  words,
  onSaveScope,
  onClose,
}) => {
  const [activeDeckIds, setActiveDeckIds] = useState<string[]>(studyScope.activeDeckIds);
  const [excludedTagIds, setExcludedTagIds] = useState<string[]>(studyScope.excludedTagIds);
  const [isSaving, setIsSaving] = useState(false);

  const toggleDeck = (deckId: string) => {
    if (activeDeckIds.includes(deckId)) {
      setActiveDeckIds(activeDeckIds.filter((id) => id !== deckId));
    } else {
      setActiveDeckIds([...activeDeckIds, deckId]);
    }
  };

  const toggleTagExclusion = (tagId: string) => {
    if (excludedTagIds.includes(tagId)) {
      setExcludedTagIds(excludedTagIds.filter((id) => id !== tagId));
    } else {
      setExcludedTagIds([...excludedTagIds, tagId]);
    }
  };

  // Live count calculation
  const targetWordsCount = words.filter((w) => {
    if (w.status !== 'active') return false;
    if (activeDeckIds.length > 0 && !activeDeckIds.includes(w.deckId)) return false;
    if (w.tags.some((t) => excludedTagIds.includes(t))) return false;
    return true;
  }).length;

  const handleSave = async () => {
    setIsSaving(true);
    let saved = false;
    try {
      saved = await onSaveScope({
        activeDeckIds,
        excludedTagIds,
        pausedWordIds: studyScope.pausedWordIds,
      });
    } finally {
      setIsSaving(false);
    }
    if (saved) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-xl w-full bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-2xl text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">Chỉnh sửa Study Scope</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Words Target Indicator */}
        <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
          <span className="text-xs text-slate-600 font-medium">Tổng số từ sẵn sàng học:</span>
          <span className="text-2xl font-extrabold text-indigo-700">{targetWordsCount} từ active</span>
        </div>

        {/* Active Decks Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Folder className="w-4 h-4 text-indigo-600" />
            <span>Active Decks ({activeDeckIds.length}/{decks.length})</span>
          </label>
          <div className="space-y-1.5">
            {decks.map((deck) => {
              const isActive = activeDeckIds.includes(deck.id);
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => toggleDeck(deck.id)}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between text-xs font-bold transition ${
                    isActive
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: deck.color }} />
                    <span>{deck.name}</span>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Excluded Tags Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <TagIcon className="w-4 h-4 text-amber-500" />
            <span>Excluded Tags (Bỏ qua khi học)</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {tags.map((tag) => {
              const isExcluded = excludedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTagExclusion(tag.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                    isExcluded
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {isExcluded ? '✓ Excluded: ' : ''}{tag.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save & Apply */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold transition">
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-100 transition disabled:opacity-60"
          >
            {isSaving ? 'Đang lưu...' : 'Save & Apply Scope'}
          </button>
        </div>
      </div>
    </div>
  );
};
