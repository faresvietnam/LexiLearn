import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Plus, Trash2, Globe, AlertCircle, Check } from 'lucide-react';
import { Word, Deck, Tag, WordPart, WordPartType, ExampleSentence, UserSettings } from '../types';
import {analyzeWordWithAI} from '../features/ai/aiClient';
import {AiRequestError, type WordAnalysis} from '../features/ai/wordAnalysis';
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
  aiSettings?: Pick<
    UserSettings,
    | 'aiProvider'
    | 'geminiApiKey'
    | 'openAICompatibleBaseUrl'
    | 'openAICompatibleToken'
    | 'openAICompatibleModel'
  >;
  onAddWord: (newWord: Word) => Promise<boolean>;
  onLinkExistingGlobalWord: (wordId: string) => Promise<boolean>;
  onClose: () => void;
}

type WordDraft = {
  word: string;
  ipa: string;
  wordParts: WordPart[];
  meanings: MeaningDraft[];
  wordFamily?: string[];
  deckId: string;
  tagIds: string[];
  image?: UploadedImage | null;
  idSuffix?: string;
};

type MeaningDraft = {
  id: string;
  vietnameseMeaning: string;
  partOfSpeech: string;
  definitionEn: string;
  exampleSentences: string[];
};

function emptyMeaningDraft(id: string): MeaningDraft {
  return {
    id,
    vietnameseMeaning: '',
    partOfSpeech: 'noun',
    definitionEn: '',
    exampleSentences: [''],
  };
}

function createWordFromDraft(draft: WordDraft): Word {
  const normalizedWord = draft.word.trim().toLowerCase();
  const idSuffix = draft.idSuffix ?? `${Date.now()}`;
  const wordId = `word_user_${idSuffix}`;

  return {
    id: wordId,
    word: normalizedWord,
    ...(draft.ipa.trim() ? {ipa: draft.ipa.trim()} : {}),
    wordStructure: draft.wordParts.filter((part) => part.text.trim() !== ''),
    wordFamily: draft.wordFamily?.length ? draft.wordFamily : [normalizedWord],
    isGlobal: false,
    approvalStatus: 'approved',
    createdBy: 'user_learner',
    createdAt: new Date().toISOString().split('T')[0],
    deckId: draft.deckId,
    tags: draft.tagIds,
    status: 'active',
    ...(draft.image
      ? {
          imageUrl: draft.image.publicUrl,
          imageObjectKey: draft.image.objectKey,
        }
      : {}),
    meanings: draft.meanings.map((meaning, meaningIndex) => {
      const meaningCardId = `meaning_${idSuffix}_${meaningIndex}`;
      const exampleObjects: ExampleSentence[] = meaning.exampleSentences
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .map((sentence, exampleIndex) => ({
          id: `ex_${idSuffix}_${meaningIndex}_${exampleIndex}`,
          meaningCardId,
          sentence,
          expectedAnswer: normalizedWord,
          baseWord: normalizedWord,
          wordForm: 'base',
          partOfSpeech: meaning.partOfSpeech,
          difficulty: 'medium',
          approvalStatus: 'approved',
        }));

      return {
        id: meaningCardId,
        wordId,
        meaning: meaning.vietnameseMeaning.trim(),
        partOfSpeech: meaning.partOfSpeech,
        ...(meaning.definitionEn.trim()
          ? {definitionEn: meaning.definitionEn.trim()}
          : {}),
        memoryStrength: 'critical',
        memoryScore: 20,
        reviewIntervalDays: 1,
        nextReviewDate: new Date().toISOString().split('T')[0],
        firstAttemptErrorRate: 0,
        forgottenWordParts: [],
        history: [],
        exampleSentences: exampleObjects,
      };
    }),
  };
}

function draftFromGemini(
  data: WordAnalysis,
  deckId: string,
  tagIds: string[],
  idSuffix: string,
): Word {
  const parts: WordPart[] = data.wordStructure.map((part, index) => ({
    id: `part_ai_${idSuffix}_${index}`,
    text: part.text,
    type: part.type,
    meaning: part.meaningVi,
    order: index + 1,
  }));
  const meanings = data.meanings.length > 0
    ? data.meanings.map((meaning, index) => ({
        id: `meaning_ai_${idSuffix}_${index}`,
        vietnameseMeaning: meaning.meaningVi,
        partOfSpeech: meaning.partOfSpeech.toLowerCase(),
        definitionEn: meaning.definitionEn,
        exampleSentences: meaning.examples.map((example) => example.sentence),
      }))
    : [{
        ...emptyMeaningDraft(`meaning_ai_${idSuffix}_0`),
        vietnameseMeaning: data.vietnameseMeaning,
        partOfSpeech: data.partOfSpeech.toLowerCase(),
      }];
  return createWordFromDraft({
    word: data.canonicalWord,
    ipa: data.ipa,
    wordParts: parts,
    meanings,
    wordFamily: data.wordFamily,
    deckId,
    tagIds,
    idSuffix,
  });
}

export const AddWordModal: React.FC<AddWordModalProps> = ({
  decks,
  tags,
  globalWords,
  linkedGlobalWords,
  geminiApiKey = null,
  aiSettings = {
    aiProvider: 'gemini' as const,
    geminiApiKey,
    openAICompatibleBaseUrl: '',
    openAICompatibleToken: null,
    openAICompatibleModel: '',
  },
  onAddWord,
  onLinkExistingGlobalWord,
  onClose,
}) => {
  const [word, setWord] = useState('');
  const [meanings, setMeanings] = useState<MeaningDraft[]>([
    emptyMeaningDraft('meaning_1'),
  ]);
  const [ipa, setIpa] = useState('');
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0]?.id || '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Morphology structure parts
  const [wordParts, setWordParts] = useState<WordPart[]>([
    { id: 'part_1', text: '', type: 'root', meaning: '', order: 1 },
  ]);

  // AI loading state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [batchWords, setBatchWords] = useState('');
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchAdded, setBatchAdded] = useState(0);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const uploadedImageRef = useRef<UploadedImage | null>(null);
  const imageCommittedRef = useRef(false);
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

  const handleAddMeaning = () => {
    setMeanings((current) => [
      ...current,
      emptyMeaningDraft(`meaning_${Date.now()}`),
    ]);
  };

  const handleRemoveMeaning = (id: string) => {
    setMeanings((current) =>
      current.length === 1
        ? current
        : current.filter((meaning) => meaning.id !== id)
    );
  };

  const handleUpdateMeaning = (
    id: string,
    update: Partial<MeaningDraft>,
  ) => {
    setMeanings((current) =>
      current.map((meaning) =>
        meaning.id === id ? {...meaning, ...update} : meaning
      )
    );
  };

  const analyzeWord = (inputWord: string) => analyzeWordWithAI({
    provider: aiSettings.aiProvider,
    word: inputWord,
    geminiApiKey: aiSettings.geminiApiKey,
    openAICompatible: {
      baseUrl: aiSettings.openAICompatibleBaseUrl,
      token: aiSettings.openAICompatibleToken,
      model: aiSettings.openAICompatibleModel,
    },
  });

  // The authenticated browser calls the selected provider directly.
  const handleAiAutoFill = async () => {
    if (!word.trim()) return;
    setAiError(null);
    setIsAiLoading(true);

    try {
      const data = await analyzeWord(word);

      handleWordChange(data.canonicalWord);
      if (data.ipa) setIpa(data.ipa);
      const analyzedMeanings = data.meanings.length > 0
        ? data.meanings.map((meaning, index) => ({
            id: `meaning_ai_${Date.now()}_${index}`,
            vietnameseMeaning: meaning.meaningVi,
            partOfSpeech: meaning.partOfSpeech.toLowerCase(),
            definitionEn: meaning.definitionEn,
            exampleSentences: meaning.examples.map((example) => example.sentence),
          }))
        : [{
            ...emptyMeaningDraft(`meaning_ai_${Date.now()}_0`),
            vietnameseMeaning: data.vietnameseMeaning,
            partOfSpeech: data.partOfSpeech.toLowerCase(),
          }];
      setMeanings(analyzedMeanings);

      if (data.wordStructure && Array.isArray(data.wordStructure)) {
        setWordParts(
          data.wordStructure.map((p: any, i: number) => ({
            id: `part_ai_${i}`,
            text: p.text,
            type: p.type || 'root',
            meaning: p.meaningVi || '',
            order: i + 1,
          }))
        );
      }
    } catch (error) {
      setAiError(error instanceof AiRequestError
        ? error.message
        : 'Không thể phân tích bằng AI. Vui lòng nhập thủ công.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleBatchAiAutoFill = async () => {
    const words: string[] = Array.from(new Set<string>(
      batchWords
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toLowerCase()),
    ));
    if (words.length === 0) return;
    setBatchError(null);
    setBatchTotal(words.length);
    setBatchAdded(0);
    setBatchProgress(`Đang chuẩn bị ${words.length} từ...`);
    setIsBatchLoading(true);
    let added = 0;
    const failed: string[] = [];

    try {
      for (let index = 0; index < words.length; index += 1) {
        const inputWord = words[index];
        setBatchProgress(`Đang xử lý ${index + 1}/${words.length}: ${inputWord}`);
        try {
          const data = await analyzeWord(inputWord);
          const normalized = data.canonicalWord.toLowerCase();
          const existing = [...globalWords, ...linkedGlobalWords].find(
            (candidate) => candidate.word.toLowerCase() === normalized,
          );
          const saved = existing
            ? await onLinkExistingGlobalWord(existing.id)
            : await onAddWord(draftFromGemini(
                data,
                selectedDeckId,
                selectedTagIds,
                `${Date.now()}_${index}`,
              ));
          if (!saved) throw new Error('Không thể lưu từ');
          added += 1;
          setBatchAdded(added);
        } catch {
          failed.push(inputWord);
        }
      }
    } finally {
      setIsBatchLoading(false);
    }

    setBatchWords(failed.join('\n'));
    setBatchProgress(`Đã thêm ${added}/${words.length} từ theo thứ tự.`);
    if (failed.length > 0) {
      setBatchError(`Chưa thêm được: ${failed.join(', ')}. Bạn có thể chạy lại các từ này.`);
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
        void deleteWordImage(uploadedImage.objectKey).catch(() => undefined);
      }
      imageCommittedRef.current = false;
      uploadedImageRef.current = metadata;
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
    uploadedImageRef.current = null;
    setUploadedImage(null);
  };

  useEffect(() => () => {
    const image = uploadedImageRef.current;
    if (image && !imageCommittedRef.current) {
      void deleteWordImage(image.objectKey).catch(() => undefined);
    }
  }, []);

  const handleClose = async () => {
    await cleanupUploadedImage();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !word.trim()
      || meanings.length === 0
      || meanings.some((meaning) =>
        !meaning.vietnameseMeaning.trim() || !meaning.partOfSpeech.trim()
      )
    ) return;

    if (duplicateGlobalWord) {
      await handleLinkGlobal();
      return;
    }

    const newWord = createWordFromDraft({
      word,
      ipa,
      wordParts,
      meanings,
      deckId: selectedDeckId,
      tagIds: selectedTagIds,
      image: uploadedImage,
    });

    setIsSaving(true);
    let saved = false;
    try {
      saved = await onAddWord(newWord);
    } finally {
      setIsSaving(false);
    }
    if (saved) {
      imageCommittedRef.current = true;
      uploadedImageRef.current = null;
      setUploadedImage(null);
      setWord('');
      setIpa('');
      setMeanings([emptyMeaningDraft('meaning_1')]);
      setWordParts([{id: 'part_1', text: '', type: 'root', meaning: '', order: 1}]);
      setSelectedGlobalWordId('');
      setDuplicateGlobalWord(null);
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

          <div className="space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <label
              htmlFor="batch-words"
              className="text-xs font-bold text-indigo-900"
            >
              AI thêm nhiều từ (mỗi dòng hoặc dấu phẩy một từ)
            </label>
            <textarea
              id="batch-words"
              aria-label="AI thêm nhiều từ"
              value={batchWords}
              onChange={(event) => setBatchWords(event.target.value)}
              placeholder="transportation\nsuccessful\nknowledge"
              rows={3}
              disabled={isBatchLoading}
              className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 transition"
            />
              <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleBatchAiAutoFill()}
                disabled={isBatchLoading || !batchWords.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                {isBatchLoading ? 'AI đang thêm tuần tự...' : 'AI thêm danh sách'}
              </button>
                {batchProgress && (
                  <span className="text-xs text-indigo-800" role="status">
                    {batchProgress}
                  </span>
                )}
              </div>
            {batchTotal > 0 && (
              <div className="space-y-1.5" aria-label={`Đã thêm ${batchAdded}/${batchTotal} từ`}>
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                  <span>Tiến độ thêm từ</span>
                  <span>{batchAdded}/{batchTotal}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{width: `${batchTotal > 0 ? (batchAdded / batchTotal) * 100 : 0}%`}}
                  />
                </div>
              </div>
            )}
            {batchError && (
              <p role="alert" className="text-xs text-rose-700">
                {batchError}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Nghĩa của từ
              </label>
              <button
                type="button"
                onClick={handleAddMeaning}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm nghĩa
              </button>
            </div>

            {meanings.map((meaning, meaningIndex) => (
              <div
                key={meaning.id}
                className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">
                    Nghĩa {meaningIndex + 1}
                  </h3>
                  <button
                    type="button"
                    aria-label={`Xóa nghĩa ${meaningIndex + 1}`}
                    disabled={meanings.length === 1}
                    onClick={() => handleRemoveMeaning(meaning.id)}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label
                      htmlFor={`meaning-vi-${meaning.id}`}
                      className="text-xs font-bold text-slate-700"
                    >
                      Nghĩa Tiếng Việt *
                    </label>
                    <input
                      id={`meaning-vi-${meaning.id}`}
                      aria-label={`Nghĩa tiếng Việt ${meaningIndex + 1}`}
                      type="text"
                      required
                      value={meaning.vietnameseMeaning}
                      onChange={(event) => handleUpdateMeaning(meaning.id, {
                        vietnameseMeaning: event.target.value,
                      })}
                      placeholder="e.g. Giao thông vận tải"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={`meaning-pos-${meaning.id}`}
                      className="text-xs font-bold text-slate-700"
                    >
                      Từ loại *
                    </label>
                    <select
                      id={`meaning-pos-${meaning.id}`}
                      aria-label={`Từ loại ${meaningIndex + 1}`}
                      value={meaning.partOfSpeech}
                      onChange={(event) => handleUpdateMeaning(meaning.id, {
                        partOfSpeech: event.target.value,
                      })}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="noun">Noun (danh từ)</option>
                      <option value="verb">Verb (động từ)</option>
                      <option value="adjective">Adjective (tính từ)</option>
                      <option value="adverb">Adverb (phó từ)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`meaning-definition-${meaning.id}`}
                    className="text-xs font-bold text-slate-700"
                  >
                    Định nghĩa tiếng Anh
                  </label>
                  <input
                    id={`meaning-definition-${meaning.id}`}
                    aria-label={`Định nghĩa tiếng Anh ${meaningIndex + 1}`}
                    type="text"
                    value={meaning.definitionEn}
                    onChange={(event) => handleUpdateMeaning(meaning.id, {
                      definitionEn: event.target.value,
                    })}
                    placeholder="Optional English definition"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Câu ví dụ
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateMeaning(meaning.id, {
                        exampleSentences: [...meaning.exampleSentences, ''],
                      })}
                      className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm câu ví dụ
                    </button>
                  </div>
                  {meaning.exampleSentences.map((sentence, exampleIndex) => (
                    <div
                      key={`${meaning.id}-${exampleIndex}`}
                      className="flex items-start gap-2"
                    >
                      <textarea
                        aria-label={`Câu ví dụ ${meaningIndex + 1}.${exampleIndex + 1}`}
                        value={sentence}
                        onChange={(event) => {
                          const nextExamples = [...meaning.exampleSentences];
                          nextExamples[exampleIndex] = event.target.value;
                          handleUpdateMeaning(meaning.id, {
                            exampleSentences: nextExamples,
                          });
                        }}
                        placeholder={`Ví dụ câu ${exampleIndex + 1}...`}
                        rows={2}
                        className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 transition text-xs"
                      />
                      {meaning.exampleSentences.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Xóa câu ví dụ ${meaningIndex + 1}.${exampleIndex + 1}`}
                          onClick={() => handleUpdateMeaning(meaning.id, {
                            exampleSentences: meaning.exampleSentences.filter(
                              (_, index) => index !== exampleIndex,
                            ),
                          })}
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
              <div className="space-y-2">
                <p className="text-xs text-emerald-700">Đã tải ảnh lên.</p>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <img
                    src={uploadedImage.publicUrl}
                    alt="Ảnh minh họa xem trước"
                    className="max-h-48 w-full rounded-lg object-contain"
                  />
                </div>
              </div>
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

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Từ, nghĩa, định nghĩa, cấu tạo từ, câu ví dụ, Deck và Tag
            được lưu lâu dài.
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
