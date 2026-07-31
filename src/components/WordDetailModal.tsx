import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  Globe,
  Lock,
  Tag as TagIcon,
  Folder,
  Calendar,
  Pencil,
  Eye,
  Plus,
  Trash2,
  Save,
  Sparkles,
} from 'lucide-react';
import { Word, Deck, Tag, WordPart, MeaningCard, WordPartType, WordStudyStatus, ExampleSentence } from '../types';
import {formatRelativeDueTime} from '../features/scheduling/relativeDueTime';
import type {ProgressAttemptRow} from '../features/analytics/progressAnalytics';

interface WordDetailModalProps {
  word: Word | null;
  decks: Deck[];
  tags: Tag[];
  onSaveWord: (updatedWord: Word) => void;
  onClose: () => void;
  attempts?: ProgressAttemptRow[];
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  word,
  decks,
  tags,
  onSaveWord,
  onClose,
  attempts = [],
}) => {
  if (!word) return null;

  const [isEditing, setIsEditing] = useState(false);

  // Edit state initialized from word
  const [editedWord, setEditedWord] = useState<string>(word.word);
  const [editedIpa, setEditedIpa] = useState<string>(word.ipa || '');
  const [editedDeckId, setEditedDeckId] = useState<string>(word.deckId);
  const [editedTags, setEditedTags] = useState<string[]>(word.tags || []);
  const [editedStatus, setEditedStatus] = useState<WordStudyStatus>(word.status);
  const [editedStructure, setEditedStructure] = useState<WordPart[]>(word.wordStructure || []);
  const [editedMeanings, setEditedMeanings] = useState<MeaningCard[]>(word.meanings || []);

  useEffect(() => {
    if (word) {
      setEditedWord(word.word);
      setEditedIpa(word.ipa || '');
      setEditedDeckId(word.deckId);
      setEditedTags(word.tags || []);
      setEditedStatus(word.status);
      setEditedStructure(word.wordStructure || []);
      setEditedMeanings(word.meanings || []);
      setIsEditing(false);
    }
  }, [word]);

  const deck = decks.find((d) => d.id === (isEditing ? editedDeckId : word.deckId));
  const wordTags = tags.filter((t) => (isEditing ? editedTags : word.tags).includes(t.id));

  const handlePlayAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(isEditing ? editedWord : word.word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleToggleTag = (tagId: string) => {
    if (editedTags.includes(tagId)) {
      setEditedTags(editedTags.filter((t) => t !== tagId));
    } else {
      setEditedTags([...editedTags, tagId]);
    }
  };

  const handleAddStructurePart = () => {
    const newPart: WordPart = {
      id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      text: '',
      type: 'root',
      meaning: '',
      order: editedStructure.length + 1,
    };
    setEditedStructure([...editedStructure, newPart]);
  };

  const handleUpdateStructurePart = (id: string, field: keyof WordPart, val: any) => {
    setEditedStructure((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: val } : p))
    );
  };

  const handleRemoveStructurePart = (id: string) => {
    setEditedStructure((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddMeaningCard = () => {
    const newCard: MeaningCard = {
      id: `meaning_${Date.now()}`,
      wordId: word.id,
      meaning: '',
      partOfSpeech: 'noun',
      memoryStrength: 'weak',
      memoryScore: 50,
      reviewIntervalDays: 1,
      nextReviewDate: new Date().toISOString().split('T')[0],
      firstAttemptErrorRate: 0,
      forgottenWordParts: [],
      history: [],
      exampleSentences: [
        {
          id: `ex_${Date.now()}`,
          meaningCardId: `meaning_${Date.now()}`,
          sentence: '',
          expectedAnswer: editedWord,
          baseWord: editedWord,
          wordForm: 'base',
          partOfSpeech: 'noun',
          difficulty: 'medium',
          approvalStatus: 'approved',
        },
      ],
    };
    setEditedMeanings([...editedMeanings, newCard]);
  };

  const handleUpdateMeaning = (id: string, field: string, value: any) => {
    setEditedMeanings((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (field === 'meaning') return { ...m, meaning: value };
        if (field === 'partOfSpeech') return { ...m, partOfSpeech: value };
        return m;
      })
    );
  };

  const handleAddExampleSentenceToMeaning = (meaningId: string) => {
    setEditedMeanings((prev) =>
      prev.map((m) => {
        if (m.id !== meaningId) return m;
        const newEx: ExampleSentence = {
          id: `ex_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          meaningCardId: m.id,
          sentence: '',
          expectedAnswer: editedWord,
          baseWord: editedWord,
          wordForm: 'base',
          partOfSpeech: m.partOfSpeech,
          difficulty: 'medium',
          approvalStatus: 'approved',
        };
        return { ...m, exampleSentences: [...m.exampleSentences, newEx] };
      })
    );
  };

  const handleUpdateExampleSentenceByIndex = (meaningId: string, exIndex: number, text: string) => {
    setEditedMeanings((prev) =>
      prev.map((m) => {
        if (m.id !== meaningId) return m;
        const updated = m.exampleSentences.map((ex, idx) =>
          idx === exIndex ? { ...ex, sentence: text } : ex
        );
        return { ...m, exampleSentences: updated };
      })
    );
  };

  const handleRemoveExampleSentenceByIndex = (meaningId: string, exIndex: number) => {
    setEditedMeanings((prev) =>
      prev.map((m) => {
        if (m.id !== meaningId) return m;
        const updated = m.exampleSentences.filter((_, idx) => idx !== exIndex);
        return { ...m, exampleSentences: updated };
      })
    );
  };

  const handleRemoveMeaningCard = (id: string) => {
    if (editedMeanings.length <= 1) {
      alert('Mỗi từ vựng phải có ít nhất 1 nghĩa.');
      return;
    }
    setEditedMeanings((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedWord.trim()) {
      alert('Từ Tiếng Anh không được để trống.');
      return;
    }

    const updatedWord: Word = {
      ...word,
      word: editedWord.trim(),
      ipa: editedIpa.trim(),
      deckId: editedDeckId,
      tags: editedTags,
      status: editedStatus,
      wordStructure: editedStructure,
      meanings: editedMeanings,
    };

    onSaveWord(updatedWord);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl my-8 text-slate-800">
        {/* Header & Controls */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {isEditing ? 'Chỉnh sửa từ vựng' : word.word}
              </span>
              {word.isGlobal ? (
                <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                  <Globe className="w-3 h-3" /> Global
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                  <Lock className="w-3 h-3" /> Private Word
                </span>
              )}
            </div>
            {!isEditing && word.ipa && (
              <p className="text-sm font-mono text-indigo-600 font-bold mt-0.5">{word.ipa}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs border border-indigo-200 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Chỉnh sửa</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem chi tiết</span>
              </button>
            )}

            <button
              onClick={handlePlayAudio}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-indigo-600 transition"
              title="Phát âm"
            >
              <Volume2 className="w-5 h-5" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* EDIT MODE FORM */}
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-6 text-sm">
            {/* Word & IPA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Từ Tiếng Anh *</label>
                <input
                  type="text"
                  required
                  value={editedWord}
                  onChange={(e) => setEditedWord(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold text-base focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Phiên âm IPA</label>
                <input
                  type="text"
                  value={editedIpa}
                  onChange={(e) => setEditedIpa(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Deck & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Thuộc Deck</label>
                <select
                  value={editedDeckId}
                  onChange={(e) => setEditedDeckId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Trạng thái học</label>
                <select
                  value={editedStatus}
                  onChange={(e) => setEditedStatus(e.target.value as WordStudyStatus)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value="active">Active (Đang học)</option>
                  <option value="paused">Paused (Tạm dừng)</option>
                  <option value="archived">Archived (Lưu trữ)</option>
                </select>
              </div>
            </div>

            {/* Tags Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Gắn Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const isSelected = editedTags.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => handleToggleTag(t.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      #{t.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Meanings List Editor */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Nghĩa Tiếng Việt & Learning Cards ({editedMeanings.length}):
                </label>
                <button
                  type="button"
                  onClick={handleAddMeaningCard}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm nghĩa mới
                </button>
              </div>

              <div className="space-y-3">
                {editedMeanings.map((card, idx) => (
                  <div
                    key={card.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-600 uppercase">
                        Card {idx + 1}
                      </span>
                      {editedMeanings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMeaningCard(card.id)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">Nghĩa Tiếng Việt</label>
                        <input
                          type="text"
                          required
                          value={card.meaning}
                          onChange={(e) => handleUpdateMeaning(card.id, 'meaning', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">Từ loại</label>
                        <select
                          value={card.partOfSpeech}
                          onChange={(e) =>
                            handleUpdateMeaning(card.id, 'partOfSpeech', e.target.value)
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none"
                        >
                          <option value="noun">Noun (danh từ)</option>
                          <option value="verb">Verb (động từ)</option>
                          <option value="adjective">Adjective (tính từ)</option>
                          <option value="adverb">Adverb (phó từ)</option>
                          <option value="phrase">Phrase (cụm từ)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-600">
                          Ví dụ câu (Context):
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddExampleSentenceToMeaning(card.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm ví dụ
                        </button>
                      </div>

                      {card.exampleSentences.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => handleAddExampleSentenceToMeaning(card.id)}
                          className="text-xs text-indigo-600 italic hover:underline"
                        >
                          + Thêm câu ví dụ cho nghĩa này
                        </button>
                      ) : (
                        card.exampleSentences.map((ex, exIdx) => (
                          <div key={ex.id || exIdx} className="flex items-start gap-2">
                            <textarea
                              rows={2}
                              value={ex.sentence}
                              onChange={(e) =>
                                handleUpdateExampleSentenceByIndex(card.id, exIdx, e.target.value)
                              }
                              placeholder="e.g. The goods were transported by truck."
                              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveExampleSentenceByIndex(card.id, exIdx)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition mt-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Word Structure (Morphology) Editor */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cấu tạo từ (Morphology Breakdown):
                </label>
                <button
                  type="button"
                  onClick={handleAddStructurePart}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm thành phần
                </button>
              </div>

              {editedStructure.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Chưa phân tích cấu tạo từ.</p>
              ) : (
                <div className="space-y-2">
                  {editedStructure.map((part) => (
                    <div key={part.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={part.text}
                        onChange={(e) =>
                          handleUpdateStructurePart(part.id, 'text', e.target.value)
                        }
                        placeholder="text (trans)"
                        className="w-28 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                      <select
                        value={part.type}
                        onChange={(e) =>
                          handleUpdateStructurePart(part.id, 'type', e.target.value as WordPartType)
                        }
                        className="w-32 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                      >
                        <option value="prefix">Prefix</option>
                        <option value="root">Root</option>
                        <option value="base">Base</option>
                        <option value="suffix">Suffix</option>
                      </select>
                      <input
                        type="text"
                        value={part.meaning || ''}
                        onChange={(e) =>
                          handleUpdateStructurePart(part.id, 'meaning', e.target.value)
                        }
                        placeholder="Nghĩa (across)"
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveStructurePart(part.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition"
              >
                <Save className="w-4 h-4" />
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </form>
        ) : (
          /* READ-ONLY VIEW MODE */
          <div className="space-y-6 text-sm">
            {/* Deck & Tags Metadata */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {deck && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                  <Folder className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Deck: <strong>{deck.name}</strong></span>
                </div>
              )}

              {wordTags.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-slate-700 border font-semibold"
                  style={{ borderColor: `${t.color}40`, backgroundColor: `${t.color}15` }}
                >
                  <TagIcon className="w-3 h-3" style={{ color: t.color }} />
                  <span>{t.name}</span>
                </div>
              ))}

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold">
                <span>Trạng thái: {word.status.toUpperCase()}</span>
              </div>
            </div>

            {/* Meanings & Learning Cards */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Danh sách nghĩa & Learning Cards ({word.meanings.length}):
              </h4>

              <div className="space-y-3">
                {word.meanings.map((card, idx) => (
                  <div
                    key={card.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-indigo-600 uppercase font-mono">
                          Card {idx + 1} • {card.partOfSpeech}
                        </span>
                        <h5 className="text-lg font-extrabold text-slate-900 mt-0.5">
                          {card.meaning}
                        </h5>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                            card.memoryStrength === 'strong'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : card.memoryStrength === 'stable'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : card.memoryStrength === 'weak'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          Memory: {card.memoryStrength} ({card.memoryScore}%)
                        </span>
                        {card.learningStatus && (
                          <span className="text-[11px] font-semibold text-slate-500">
                            {{new: 'Mới', learning: 'Đang học', review: 'Review', relearning: 'Học lại'}[card.learningStatus]}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Example Sentences */}
                    {card.exampleSentences.length > 0 && (
                      <div className="space-y-1.5 text-xs text-slate-700 pt-1">
                        <span className="text-slate-500 font-semibold">Ví dụ câu:</span>
                        {card.exampleSentences.map((ex) => (
                          <div
                            key={ex.id}
                            className="p-2.5 rounded-xl bg-white border border-slate-200 italic font-serif text-slate-800"
                          >
                            "{ex.sentence}"
                          </div>
                        ))}
                      </div>
                    )}

                    {/* SRS Info */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-200/60">
                      <span className="font-semibold text-indigo-700">
                        Trạng thái FSRS: {card.learningStatus ?? ({0: 'Mới', 1: 'Đang học', 2: 'Review', 3: 'Học lại'}[card.fsrsState ?? 0])}
                      </span>
                      <span className="font-semibold text-indigo-700">
                        Khả năng nhớ dự đoán: {(card.fsrsState ?? 0) === 0 ? '—' : `${Math.round((card.fsrsRetrievability ?? card.memoryScore / 100) * 100)}%`}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        Ôn tiếp theo: {(card.fsrsState ?? 0) === 0 ? 'Chưa có lịch ôn' : formatRelativeDueTime(card.nextReviewDate)}
                      </span>
                      <span>Ôn gần nhất: {card.lastReviewedDate ? formatRelativeDueTime(card.lastReviewedDate) : 'Chưa ôn'}</span>
                      <span>Số lần trả lời: {attempts.filter((attempt) => attempt.learning_card_id === card.id).length}</span>
                      <span>Đúng lần đầu: {(() => { const first = attempts.filter((attempt) => attempt.learning_card_id === card.id && attempt.first_attempt); return first.length > 0 ? `${Math.round(first.filter((attempt) => attempt.is_correct).length / first.length * 100)}%` : '—'; })()}</span>
                      <span>Khoảng cách: {card.reviewIntervalDays} ngày</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Word Structure (Morphology) */}
            {word.wordStructure.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cấu tạo từ (Morphology Breakdown):
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {word.wordStructure.map((part) => (
                    <div
                      key={part.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-0.5"
                    >
                      <div className="font-mono text-indigo-700 font-extrabold text-sm">
                        {part.text}
                      </div>
                      <div className="text-slate-500 font-bold uppercase text-[10px]">
                        {part.type}
                      </div>
                      {part.meaning && <div className="text-slate-600 italic">{part.meaning}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md shadow-indigo-100"
              >
                <Pencil className="w-4 h-4" />
                <span>Chỉnh sửa từ này</span>
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
