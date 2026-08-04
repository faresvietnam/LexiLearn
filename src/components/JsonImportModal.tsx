import React, { useState } from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Word, Deck, Tag } from '../types';
import {parseJsonImport, type ParsedJsonEntry} from '../features/import/jsonImportParser';
import {matchDeckByName, matchTagByName, resolveJsonImportWords} from '../features/import/jsonImportResolver';
import {routeImportedRow, type ImportRoute} from '../features/import/importRouting';
import type {CsvImportRowInput, ResumableCsvImportRow} from '../features/persistence/importRepository';

export type ImportSummary = {
  created: number;
  linked: number;
  skippedDuplicate: number;
  failed: number;
};

interface JsonImportModalProps {
  existingWords: Word[];
  decks: Deck[];
  tags: Tag[];
  onCreateDeck: (deck: Deck) => Promise<Deck | null>;
  onCreateTag: (tag: Tag) => Promise<Tag | null>;
  onConfirmImport: (newWords: Word[], rows: CsvImportRowInput[]) => Promise<ImportSummary>;
  resumableRows?: ResumableCsvImportRow[];
  onResumeImport?: (rows: ResumableCsvImportRow[]) => void | Promise<void>;
  onClose: () => void;
}

const SAMPLE_JSON = `[
  {
    "word": "transportation",
    "deck_name": "IELTS",
    "tag_names": ["daily"],
    "meanings": [
      {
        "meaning_vi": "Giao thông vận tải",
        "part_of_speech": "noun",
        "examples": [{"sentence": "Public transportation is convenient."}]
      }
    ],
    "parts": [
      {"text": "trans", "type": "prefix"},
      {"text": "port", "type": "root", "meaning": "chở"},
      {"text": "ation", "type": "suffix"}
    ]
  }
]`;

type PreviewRow = {
  entry: ParsedJsonEntry;
  route: ImportRoute;
  deckWillCreate: boolean;
  tagsWillCreate: string[];
};

const ROUTE_LABEL: Record<ImportRoute['kind'], string> = {
  create_private: 'Sẽ tạo mới',
  link_global: 'Sẽ gộp vào Global Word',
  duplicate_private: 'Bỏ qua (đã có)',
};

export const JsonImportModal: React.FC<JsonImportModalProps> = ({
  existingWords,
  decks,
  tags,
  onCreateDeck,
  onCreateTag,
  onConfirmImport,
  resumableRows = [],
  onResumeImport,
  onClose,
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'summary'>('upload');
  const [rawText, setRawText] = useState<string>(SAMPLE_JSON);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [invalidEntries, setInvalidEntries] = useState<{index: number; errors: string[]}[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result ?? ''));
    reader.onerror = () => setRawText('');
    reader.readAsText(file);
  };

  const handleParse = () => {
    const result = parseJsonImport(rawText);
    if (result.fileError) {
      setFileError(result.fileError);
      setPreviewRows([]);
      setInvalidEntries([]);
      setDuplicateCount(0);
      return;
    }
    setFileError(null);
    setInvalidEntries(result.invalid);
    setDuplicateCount(result.duplicates.length);
    setPreviewRows(result.entries.map((entry) => ({
      entry,
      route: routeImportedRow(entry, existingWords),
      deckWillCreate: !!entry.deck_name && !matchDeckByName(entry.deck_name, decks),
      tagsWillCreate: (entry.tag_names ?? []).filter((name) => !matchTagByName(name, tags)),
    })));
    setStep('preview');
  };

  const handleConfirm = async () => {
    const entries = previewRows.map(({entry}) => entry);
    const rows: CsvImportRowInput[] = entries.map((entry) => ({
      sourceRowNumber: entry.index + 1,
      canonicalKey: entry.canonicalKey,
      rawData: entry,
    }));

    setIsImporting(true);
    try {
      const words = await resolveJsonImportWords(entries, decks, tags, onCreateDeck, onCreateTag);
      const result = await onConfirmImport(words, rows);
      setSummary(result);
      setStep('summary');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import từ vựng bằng JSON</h1>
        <p className="text-slate-500 text-sm">
          Quy trình 3 bước: Upload JSON → Preview → Confirm
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm text-slate-800">
        {step === 'upload' && (
          <div className="space-y-4">
            {resumableRows.length > 0 && onResumeImport && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <p className="text-sm font-bold text-amber-900">
                  Có {resumableRows.length} phần tử từ một lần import trước chưa hoàn tất.
                </p>
                <button
                  type="button"
                  onClick={() => void onResumeImport(resumableRows)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
                >
                  Tiếp tục import cũ
                </button>
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor="json-file" className="text-xs font-bold text-slate-700">
                Tải file JSON
              </label>
              <input
                id="json-file"
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Dữ liệu JSON Sample (hoặc dán nội dung JSON)</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={14}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
              />
            </div>
            {fileError && (
              <p role="alert" className="text-xs text-rose-700">
                {fileError}
              </p>
            )}

            <button
              onClick={handleParse}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition"
            >
              <span>Phân tích JSON</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Số từ hợp lệ:</span>{' '}
                <strong className="text-emerald-700 font-bold">{previewRows.length}</strong>
              </div>
              <div>
                <span className="text-slate-500">Trùng lặp trong file:</span>{' '}
                <strong className="text-rose-600 font-bold">{duplicateCount}</strong>
              </div>
              <div>
                <span className="text-slate-500">Lỗi:</span>{' '}
                <strong className="text-amber-700 font-bold">{invalidEntries.length}</strong>
              </div>
            </div>

            {invalidEntries.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-bold">Các phần tử chưa hợp lệ</p>
                <ul className="mt-1 list-disc pl-5">
                  {invalidEntries.map((entry) => (
                    <li key={entry.index}>Phần tử #{entry.index + 1}: {entry.errors.join(', ')}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 text-xs">
              <table className="w-full text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="p-2.5">Word</th>
                    <th className="p-2.5">Nghĩa đầu tiên</th>
                    <th className="p-2.5">Deck</th>
                    <th className="p-2.5">Tags</th>
                    <th className="p-2.5">Route</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map(({entry, route, deckWillCreate, tagsWillCreate}) => (
                    <tr key={entry.index}>
                      <td className="p-2.5 font-bold text-slate-900">{entry.word}</td>
                      <td className="p-2.5">{entry.meanings[0]?.meaning_vi}</td>
                      <td className="p-2.5">
                        {entry.deck_name
                          ? `${entry.deck_name}${deckWillCreate ? ' (sẽ tạo mới)' : ''}`
                          : '-'}
                      </td>
                      <td className="p-2.5">
                        {(entry.tag_names ?? []).length === 0
                          ? '-'
                          : entry.tag_names!.map((name) => (
                            tagsWillCreate.includes(name) ? `${name} (mới)` : name
                          )).join(', ')}
                      </td>
                      <td className="p-2.5 font-semibold text-indigo-600">{ROUTE_LABEL[route.kind]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => void handleConfirm()}
              disabled={previewRows.length === 0 || isImporting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition disabled:opacity-50"
            >
              <span>{isImporting ? 'Đang import...' : 'Xác nhận Import'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'summary' && summary && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-bold text-slate-900">Import JSON thành công!</h3>

            <div className="grid grid-cols-2 gap-3 text-left text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200 text-slate-700">
              <div>Tạo mới: <strong className="text-emerald-700 font-bold">{summary.created}</strong></div>
              <div>Gộp vào Global: <strong className="text-indigo-600 font-bold">{summary.linked}</strong></div>
              <div>Bỏ qua (trùng): <strong className="text-rose-600 font-bold">{summary.skippedDuplicate}</strong></div>
              <div>Lỗi khi lưu: <strong className="text-amber-700 font-bold">{summary.failed}</strong></div>
            </div>

            <p className="text-xs text-slate-500">
              Các từ vừa import đã được tự động đưa vào Từ vựng cá nhân và có thể học ngay.
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition"
            >
              Đóng cửa sổ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
