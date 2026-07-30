import React, { useState } from 'react';
import { X, Sparkles, Plus, Trash2, Globe, AlertCircle, Check } from 'lucide-react';
import { Word, Deck, Tag, WordPart, WordPartType, ExampleSentence } from '../types';
import {
  analyzeWordWithGemini,
  GeminiRequestError,
} from '../features/gemini/geminiClient';
import {
  deleteWordImage,
  uploadWordImage,
} from '../features/images/r2ImageUpload';
import type {UploadedImage} from '../features/images/r2ImageUpload';

interface AddWordModalProps {
  decks: Deck[];
  tags: Tag[];
  globalWords: Array<Pick<Word, 'id' | 'word' | 'ipa'>>;
  linkedGlobalWords: Array<Pick<Word, 'id' | 'word' | 'ipa'>>;
  geminiApiKey?: string | null;
  onAddWord: (newWord: Word) => Promise<boolean>;
  onLinkExistingGlobalWord: (wordId: string) => Promise<boolean>;
  onClose: () => void;
}

export const AddWordModal: React.FC<AddWordModalProps> = ({
  decks,
  tags,
  globalWords,
  linkedGlobalWords,
  geminiApiKey = null,
  onAddWord,
  onLinkExistingGlobalWord,
  onClose,
}) => {
  const [word, setWord] = useState('');
  const [vietnameseMeaning, setVietnameseMeaning] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('noun');
  const [ipa, setIpa] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0]?.id || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [exampleSentences, setExampleSentences] = useState<string[]>(['']);

  // Morphology structure parts
  const [wordParts, setWordParts] = useState<WordPart[]>([
    { id: 'part_1', text: '', type: 'root', meaning: '', order: 1 },
  ]);

  // AI loading state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedGlobalWordId, setSelectedGlobalWordId] = useState('');
  const [duplicateGlobalWord, setDuplicateGlobalWord] = useState<
    Pick<Word, 'id' | 'word' | 'ipa'> | null
  >(null);

  // Check deduplication against existing Global Vocabulary
  const handleWordChange = (val: string) => {
    setWord(val);
    setSelectedGlobalWordId('');
    const normalized = val.trim().toLowerCase();
    if (!normalized) {
      setDuplicateGlobalWord(null);
      return;
    }

    const existing = [...globalWords, ...linkedGlobalWords].find(
      (candidate) => candidate.word.toLowerCase() === normalized
    );
    setDuplicateGlobalWord(existing || null);
  };

  const handleGlobalWordSelect = (wordId: string) => {
    const selected = globalWords.find(({id}) => id === wordId) ?? null;
    setSelectedGlobalWordId(wordId);
    setDuplicateGlobalWord(selected);
    if (selected) {
      setWord(selected.word);
      setIpa(selected.ipa ?? '');
    } else {
      setWord('');
      setIpa('');
    }
  };

  // Add word part row
  const handleAddPart = () => {
    setWordParts([
      ...wordParts,
      {
        id: `part_${Date.now()}`,
        text: '',
        type: 'suffix',
        meaning: '',
        order: wordParts.length + 1,
      },
    ]);
  };

  const handleRemovePart = (id: string) => {
    setWordParts(wordParts.filter((p) => p.id !== id));
  };

  const handleUpdatePart = (id: string, field: keyof WordPart, value: any) => {
    setWordParts(
      wordParts.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  // The authenticated browser calls Gemini directly with the user's key.
  const handleAiAutoFill = async () => {
    if (!word.trim()) return;
    if (!geminiApiKey) {
      setAiError(
        'Chưa có Gemini API key. Hãy lưu key trong Cài đặt hoặc nhập thủ công.',
      );
      return;
    }
    setAiError(null);
    setIsAiLoading(true);

    try {
      const data = await analyzeWordWithGemini({
        apiKey: geminiApiKey,
        word,
      });

      if (data.ipa) setIpa(data.ipa);
      if (data.partOfSpeech) setPartOfSpeech(data.partOfSpeech.toLowerCase());
      if (data.vietnameseMeaning) setVietnameseMeaning(data.vietnameseMeaning);

      if (data.wordStructure && Array.isArray(data.wordStructure)) {
        setWordParts(
          data.wordStructure.map((p: any, i: number) => ({
            id: `part_ai_${i}`,
            text: p.text,
            type: p.type || 'root',
            meaning: p.meaning || '',
            order: i + 1,
          }))
        );
      }

      if (data.meanings && data.meanings[0]?.examples) {
        const exArray = data.meanings[0].examples.map((ex: any) => ex.sentence).filter(Boolean);
        if (exArray.length > 0) {
          setExampleSentences(exArray);
        }
      }
    } catch (error) {
      setAiError(error instanceof GeminiRequestError
        ? error.message
        : 'Không thể phân tích bằng Gemini. Vui lòng nhập thủ công.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleLinkGlobal = async () => {
    if (!duplicateGlobalWord) return;
    setIsSaving(true);
    let saved = false;
    try {
      saved = await onLinkExistingGlobalWord(duplicateGlobalWord.id);
    } finally {
      setIsSaving(false);
    }
    if (saved) {
      await cleanupUploadedImage();
      onClose();
    }
  };

  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setIsImageUploading(true);
    try {
      const metadata = await uploadWordImage(file);
      if (uploadedImage) {
        void deleteWordImage(uploadedImage.objectKey);
      }
      setUploadedImage(metadata);
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : 'Không thể tải ảnh lên R2. Vui lòng thử lại.',
      );
    } finally {
      setIsImageUploading(false);
    }
  };

  const cleanupUploadedImage = async () => {
    if (!uploadedImage) return;
    await deleteWordImage(uploadedImage.objectKey).catch(() => undefined);
    setUploadedImage(null);
  };

  const handleClose = async () => {
    await cleanupUploadedImage();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !vietnameseMeaning.trim()) return;

    if (duplicateGlobalWord) {
      await handleLinkGlobal();
      return;
    }

    const wordId = `word_user_${Date.now()}`;
    const meaningCardId = `meaning_${Date.now()}`;

    const validExamples = exampleSentences.map((s) => s.trim()).filter(Boolean);
    const exampleObjects: ExampleSentence[] = (
      validExamples.length > 0 ? validExamples : [`Example sentence for ${word}.`]
    ).map((sentText, idx) => ({
      id: `ex_${Date.now()}_${idx}`,
      meaningCardId,
      sentence: sentText,
      expectedAnswer: word.trim(),
      baseWord: word.trim(),
      wordForm: 'base',
      partOfSpeech,
      difficulty: 'medium',
      approvalStatus: 'pending',
    }));

    const newWord: Word = {
      id: wordId,
      word: word.trim().toLowerCase(),
      ipa: ipa.trim() || `/${word.trim().toLowerCase()}/`,
      wordStructure: wordParts.filter((p) => p.text.trim() !== ''),
      wordFamily: [word.trim().toLowerCase()],
      isGlobal: false,
      approvalStatus: 'pending', // Pending Admin approval
      createdBy: 'user_learner',
      createdAt: new Date().toISOString().split('T')[0],
      deckId: selectedDeckId,
      tags: selectedTagIds,
      status: 'active',
      ...(uploadedImage
        ? {
            imageUrl: uploadedImage.publicUrl,
            imageObjectKey: uploadedImage.objectKey,
          }
        : {}),
      meanings: [
        {
          id: meaningCardId,
          wordId,
          meaning: vietnameseMeaning.trim(),
          partOfSpeech,
          memoryStrength: 'critical',
          memoryScore: 20,
          reviewIntervalDays: 1,
          nextReviewDate: new Date().toISOString().split('T')[0],
          firstAttemptErrorRate: 0,
          forgottenWordParts: [],
          history: [],
          exampleSentences: exampleObjects,
        },
      ],
    };

    setIsSaving(true);
    let saved = false;
    try {
      saved = await onAddWord(newWord);
    } finally {
      setIsSaving(false);
    }
    if (saved) {
      onClose();
    } else {
      await cleanupUploadedImage();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Thêm từ vựng mới</h1>
        <p className="text-slate-500 text-sm">
          Nhập thông tin từ vựng và tự động kiểm tra trùng lặp với Global Vocabulary
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
        {/* Deduplication Alert Banner */}
        {duplicateGlobalWord && (
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
              <Globe className="w-4 h-4 text-indigo-600" />
              <span>Từ "{duplicateGlobalWord.word}" đã tồn tại trong Global Vocabulary!</span>
            </div>
            <p className="text-xs text-slate-600">
              Bạn không cần tạo mới. Bấm "Thêm vào Từ vựng cá nhân" để đưa vào danh sách học của bạn.
            </p>
            <button
              onClick={() => void handleLinkGlobal()}
              disabled={isSaving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs"
            >
              Thêm vào Từ vựng cá nhân của tôi
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 text-sm">
          <div className="space-y-1.5">
            <label
              htmlFor="global-word-select"
              className="text-xs font-bold text-slate-700"
            >
              Chọn từ Global có sẵn
            </label>
            <select
              id="global-word-select"
              value={selectedGlobalWordId}
              onChange={(event) => handleGlobalWordSelect(event.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            >
              <option value="">Tự nhập một từ mới</option>
              {globalWords.map((globalWord) => (
                <option key={globalWord.id} value={globalWord.id}>
                  {globalWord.word}{globalWord.ipa ? ` — ${globalWord.ipa}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Word & AI Auto-Fill */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Từ Tiếng Anh *</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={word}
                onChange={(e) => handleWordChange(e.target.value)}
                placeholder="e.g. transportation"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold text-base focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={handleAiAutoFill}
                disabled={isAiLoading || !word.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>{isAiLoading ? 'Analyzing...' : 'AI Auto-Fill'}</span>
              </button>
            </div>
            {aiError && (
              <p role="alert" className="text-xs text-rose-700">
                {aiError}
              </p>
            )}
          </div>

          {/* Vietnamese Meaning & Part of Speech */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Nghĩa Tiếng Việt *</label>
              <input
                type="text"
                required
                value={vietnameseMeaning}
                onChange={(e) => setVietnameseMeaning(e.target.value)}
                placeholder="e.g. Giao thông vận tải"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Từ loại *</label>
              <select
                value={partOfSpeech}
                onChange={(e) => setPartOfSpeech(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              >
                <option value="noun">Noun (danh từ)</option>
                <option value="verb">Verb (động từ)</option>
                <option value="adjective">Adjective (tính từ)</option>
                <option value="adverb">Adverb (phó từ)</option>
              </select>
            </div>
          </div>

          {/* IPA & Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Phiên âm IPA</label>
              <input
                type="text"
                value={ipa}
                onChange={(e) => setIpa(e.target.value)}
                placeholder="/ˌtrænspərˈteɪʃn/"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Thuộc Deck</label>
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional R2 image */}
          <div className="space-y-1.5">
            <label
              htmlFor="word-image"
              className="text-xs font-bold text-slate-700"
            >
              Ảnh minh họa
            </label>
            <input
              id="word-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void handleImageChange(event)}
              disabled={isImageUploading}
              className="block w-full text-xs text-slate-600"
            />
            {isImageUploading && (
              <p className="text-xs text-slate-500">Đang tải ảnh...</p>
            )}
            {uploadedImage && !isImageUploading && (
              <p className="text-xs text-emerald-700">Đã tải ảnh lên.</p>
            )}
            {imageError && (
              <p role="alert" className="text-xs text-rose-700">
                {imageError}
              </p>
            )}
          </div>

          {/* Morphology Breakdown Editor (Word Parts) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Word Structure Editor (Cấu tạo từ):
              </label>
              <button
                type="button"
                onClick={handleAddPart}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm phần
              </button>
            </div>

            <div className="space-y-2">
              {wordParts.map((part) => (
                <div key={part.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={part.text}
                    onChange={(e) => handleUpdatePart(part.id, 'text', e.target.value)}
                    placeholder="Text (trans)"
                    className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={part.type}
                    onChange={(e) => handleUpdatePart(part.id, 'type', e.target.value as WordPartType)}
                    className="w-32 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="prefix">Prefix</option>
                    <option value="root">Root</option>
                    <option value="base">Base</option>
                    <option value="suffix">Suffix</option>
                    <option value="combining_form">Combining form</option>
                    <option value="compound_component">Compound</option>
                  </select>
                  <input
                    type="text"
                    value={part.meaning || ''}
                    onChange={(e) => handleUpdatePart(part.id, 'meaning', e.target.value)}
                    placeholder="Nghĩa (across)"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePart(part.id)}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Example Sentences */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Ví dụ câu (Context):
              </label>
              <button
                type="button"
                onClick={() => setExampleSentences([...exampleSentences, ''])}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu ví dụ
              </button>
            </div>

            <div className="space-y-2">
              {exampleSentences.map((sent, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <textarea
                    value={sent}
                    onChange={(e) => {
                      const updated = [...exampleSentences];
                      updated[idx] = e.target.value;
                      setExampleSentences(updated);
                    }}
                    placeholder={`Ví dụ câu ${idx + 1}...`}
                    rows={2}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition text-xs"
                  />
                  {exampleSentences.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExampleSentences(exampleSentences.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Cấu tạo từ và câu ví dụ chỉ được giữ trong phiên hiện tại.
            Từ, nghĩa, Deck và Tag được lưu lâu dài.
          </p>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => void handleClose()}
              disabled={isImageUploading}
              className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold rounded-xl transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!!duplicateGlobalWord || isSaving || isImageUploading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-md shadow-indigo-100 disabled:opacity-50"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu từ vựng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
