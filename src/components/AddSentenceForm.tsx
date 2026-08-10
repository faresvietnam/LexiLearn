import React, {useEffect, useRef, useState} from 'react';
import {deleteWordImage, uploadWordImage} from '../features/images/r2ImageUpload';
import type {UploadedImage} from '../features/images/r2ImageUpload';
import {SentenceCard} from '../types';
import type {SentenceCardInput} from '../features/persistence/sentenceRepository';

interface AddSentenceFormProps {
  initialCard?: SentenceCard;
  onSave: (input: SentenceCardInput) => Promise<boolean>;
  onClose: () => void;
}

export const AddSentenceForm: React.FC<AddSentenceFormProps> = ({
  initialCard,
  onSave,
  onClose,
}) => {
  const [englishSentence, setEnglishSentence] = useState(initialCard?.englishSentence ?? '');
  const [vietnameseSentence, setVietnameseSentence] = useState(initialCard?.vietnameseSentence ?? '');
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(
    initialCard
      ? {objectKey: initialCard.imageObjectKey, publicUrl: initialCard.imageUrl}
      : null,
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const uploadedImageRef = useRef<UploadedImage | null>(uploadedImage);
  const imageCommittedRef = useRef(!!initialCard);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setIsImageUploading(true);
    try {
      const metadata = await uploadWordImage(file);
      if (uploadedImage && !imageCommittedRef.current) {
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

  useEffect(() => () => {
    const image = uploadedImageRef.current;
    if (image && !imageCommittedRef.current) {
      void deleteWordImage(image.objectKey).catch(() => undefined);
    }
  }, []);

  const isValid = Boolean(
    uploadedImage && englishSentence.trim() && vietnameseSentence.trim(),
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || !uploadedImage) return;

    setIsSaving(true);
    let saved = false;
    try {
      saved = await onSave({
        imageUrl: uploadedImage.publicUrl,
        imageObjectKey: uploadedImage.objectKey,
        englishSentence,
        vietnameseSentence,
      });
    } finally {
      setIsSaving(false);
    }
    if (saved) {
      imageCommittedRef.current = true;
      onClose();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {initialCard ? 'Sửa câu' : 'Thêm câu mới'}
      </h1>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="sentence-image" className="text-xs font-bold text-slate-700">
                Ảnh minh họa
              </label>
              <input
                id="sentence-image"
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
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <img
                    src={uploadedImage.publicUrl}
                    alt="Ảnh minh họa xem trước"
                    className="max-h-48 w-full rounded-lg object-contain"
                  />
                </div>
              )}
              {imageError && (
                <p role="alert" className="text-xs text-rose-700">{imageError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sentence-vi" className="text-xs font-bold text-slate-700">
                Câu tiếng Việt
              </label>
              <textarea
                id="sentence-vi"
                value={vietnameseSentence}
                onChange={(event) => setVietnameseSentence(event.target.value)}
                placeholder="e.g. Con mèo đang ngủ trên ghế sofa."
                rows={4}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sentence-en" className="text-xs font-bold text-slate-700">
              Câu tiếng Anh
            </label>
            <textarea
              id="sentence-en"
              value={englishSentence}
              onChange={(event) => setEnglishSentence(event.target.value)}
              placeholder="e.g. The cat is sleeping on the sofa."
              rows={10}
              className="w-full h-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={!isValid || isSaving || isImageUploading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {isSaving ? 'Đang lưu...' : 'Lưu câu'}
          </button>
        </div>
      </form>
    </div>
  );
};
