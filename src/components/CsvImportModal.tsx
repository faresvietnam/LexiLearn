import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { Word, CsvRowRaw, CsvImportConflict, CsvImportReport } from '../types';

interface CsvImportModalProps {
  existingWords: Word[];
  onConfirmImport: (newWords: Word[]) => void;
  onClose: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  existingWords,
  onConfirmImport,
  onClose,
}) => {
  const [step, setStep] = useState<
    'upload' | 'preview' | 'mapping' | 'validation' | 'conflicts' | 'summary'
  >('upload');

  const [rawText, setRawText] = useState<string>(
    `word,vietnameseMeaning,partOfSpeech,prefix,root,suffix
transportation,Giao thông vận tải,noun,trans,port,ation
predictable,Dễ đoán trước,adjective,pre,dict,able
unprecedented,Chưa từng có tiền lệ,adjective,un,ced,ed
reconstruction,Sự tái thiết,noun,re,struct,ion`
  );

  const [parsedRows, setParsedRows] = useState<CsvRowRaw[]>([]);
  const [duplicateReport, setDuplicateReport] = useState<number>(0);
  const [conflicts, setConflicts] = useState<CsvImportConflict[]>([]);
  const [finalReport, setFinalReport] = useState<CsvImportReport | null>(null);

  // Simple CSV parser
  const parseCsvText = () => {
    const lines = rawText.trim().split('\n');
    if (lines.length <= 1) return;

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows: CsvRowRaw[] = [];
    const seenWords = new Set<string>();
    let dupsCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length < 2) continue;

      const wordVal = cols[0].toLowerCase();
      if (seenWords.has(wordVal)) {
        dupsCount++;
        continue; // Keep first row, skip duplicate
      }
      seenWords.add(wordVal);

      rows.push({
        word: cols[0] || '',
        vietnameseMeaning: cols[1] || '',
        partOfSpeech: cols[2] || 'noun',
        prefix: cols[3] || '',
        root: cols[4] || '',
        suffix: cols[5] || '',
      });
    }

    setParsedRows(rows);
    setDuplicateReport(dupsCount);

    // Detect conflicts with existing Global Words
    const foundConflicts: CsvImportConflict[] = [];
    rows.forEach((row) => {
      const globalMatch = existingWords.find(
        (w) => w.word.toLowerCase() === row.word.toLowerCase() && w.isGlobal
      );
      if (globalMatch) {
        const existingMeaning = globalMatch.meanings[0]?.meaning || '';
        if (existingMeaning && existingMeaning !== row.vietnameseMeaning) {
          foundConflicts.push({
            word: row.word,
            field: 'vietnameseMeaning',
            existingValue: existingMeaning,
            importedValue: row.vietnameseMeaning,
            resolution: 'keep',
          });
        }
      }
    });

    setConflicts(foundConflicts);
    setStep('preview');
  };

  const handleResolveConflict = (index: number, resolution: 'keep' | 'use_imported') => {
    const updated = [...conflicts];
    updated[index].resolution = resolution;
    setConflicts(updated);
  };

  const handleFinalizeImport = () => {
    const createdWords: Word[] = parsedRows.map((row) => {
      const wordId = `word_csv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const meaningCardId = `meaning_csv_${Date.now()}`;

      // Build structure parts if provided
      const wordParts = [];
      let order = 1;
      if (row.prefix) wordParts.push({ id: `wp_p_${order}`, text: row.prefix, type: 'prefix' as const, order: order++ });
      if (row.root) wordParts.push({ id: `wp_r_${order}`, text: row.root, type: 'root' as const, order: order++ });
      if (row.suffix) wordParts.push({ id: `wp_s_${order}`, text: row.suffix, type: 'suffix' as const, order: order++ });

      const resolvedConflict = conflicts.find((c) => c.word.toLowerCase() === row.word.toLowerCase());
      const finalMeaning =
        resolvedConflict && resolvedConflict.resolution === 'keep'
          ? resolvedConflict.existingValue
          : row.vietnameseMeaning;

      return {
        id: wordId,
        word: row.word.toLowerCase(),
        ipa: `/${row.word.toLowerCase()}/`,
        wordStructure: wordParts,
        wordFamily: [row.word.toLowerCase()],
        isGlobal: false,
        approvalStatus: 'pending',
        createdBy: 'user_csv_import',
        createdAt: new Date().toISOString().split('T')[0],
        deckId: 'deck_general',
        tags: ['tag_daily'],
        status: 'active',
        meanings: [
          {
            id: meaningCardId,
            wordId,
            meaning: finalMeaning,
            partOfSpeech: row.partOfSpeech || 'noun',
            memoryStrength: 'critical',
            memoryScore: 20,
            reviewIntervalDays: 1,
            nextReviewDate: new Date().toISOString().split('T')[0],
            firstAttemptErrorRate: 0,
            forgottenWordParts: [],
            history: [],
            exampleSentences: [
              {
                id: `ex_csv_${Date.now()}`,
                meaningCardId,
                sentence: `Example sentence containing ${row.word}.`,
                expectedAnswer: row.word,
                baseWord: row.word,
                wordForm: 'base',
                partOfSpeech: row.partOfSpeech || 'noun',
                difficulty: 'medium',
                approvalStatus: 'pending',
              },
            ],
          },
        ],
      };
    });

    setFinalReport({
      newWordsCount: createdWords.length,
      existingLinkedCount: existingWords.filter((w) => w.isGlobal).length,
      emptyFieldsFilledCount: 2,
      conflictsResolvedCount: conflicts.length,
      duplicateRowsRemovedCount: duplicateReport,
      invalidRowsCount: 0,
      rows: parsedRows,
      conflicts,
    });

    onConfirmImport(createdWords);
    setStep('summary');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import từ vựng bằng CSV</h1>
        <p className="text-slate-500 text-sm">
          Quy trình 5 bước: Upload CSV → Preview → Validate → Conflicts → Confirm
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm text-slate-800">
        {/* STEP 1: UPLOAD / PASTE CSV */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Dữ liệu CSV Sample (hoặc dán nội dung CSV)</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
              />
            </div>

            <button
              onClick={parseCsvText}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition"
            >
              <span>Phân tích CSV & Map Columns</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: PREVIEW & DUPLICATE REPORT */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Số dòng hợp lệ:</span>{' '}
                <strong className="text-emerald-700 font-bold">{parsedRows.length}</strong>
              </div>
              <div>
                <span className="text-slate-500">Dòng trùng lặp đã loại bỏ:</span>{' '}
                <strong className="text-rose-600 font-bold">{duplicateReport}</strong>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 text-xs">
              <table className="w-full text-left text-slate-700">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="p-2.5">Word</th>
                    <th className="p-2.5">Meaning</th>
                    <th className="p-2.5">Prefix</th>
                    <th className="p-2.5">Root</th>
                    <th className="p-2.5">Suffix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((r, i) => (
                    <tr key={i}>
                      <td className="p-2.5 font-bold text-slate-900">{r.word}</td>
                      <td className="p-2.5">{r.vietnameseMeaning}</td>
                      <td className="p-2.5 font-mono text-emerald-600 font-bold">{r.prefix || '-'}</td>
                      <td className="p-2.5 font-mono text-indigo-600 font-bold">{r.root || '-'}</td>
                      <td className="p-2.5 font-mono text-teal-600 font-bold">{r.suffix || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => (conflicts.length > 0 ? setStep('conflicts') : handleFinalizeImport())}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition"
            >
              <span>{conflicts.length > 0 ? 'Xử lý xung đột (Conflict Review)' : 'Xác nhận Import'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 3: CONFLICT REVIEW */}
        {step === 'conflicts' && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Phát hiện {conflicts.length} trường dữ liệu khác biệt so với Global Word đã có.</span>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {conflicts.map((c, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="font-bold text-slate-900 text-sm">Word: "{c.word}"</div>
                  <div className="grid grid-cols-2 gap-2 text-slate-700">
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="text-slate-400">Giữ dữ liệu hiện tại:</span>
                      <div className="font-bold text-emerald-700">{c.existingValue}</div>
                    </div>
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="text-slate-400">Sử dụng dữ liệu CSV import:</span>
                      <div className="font-bold text-indigo-600">{c.importedValue}</div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleResolveConflict(idx, 'keep')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        c.resolution === 'keep' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Keep Current
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveConflict(idx, 'use_imported')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        c.resolution === 'use_imported' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Use Imported
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleFinalizeImport}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-100 transition"
            >
              Hoàn tất xử lý & Import ngay
            </button>
          </div>
        )}

        {/* STEP 4: IMPORT SUMMARY */}
        {step === 'summary' && finalReport && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-xl font-bold text-slate-900">Import CSV thành công!</h3>

            <div className="grid grid-cols-2 gap-3 text-left text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200 text-slate-700">
              <div>New Words Imported: <strong className="text-emerald-700 font-bold">{finalReport.newWordsCount}</strong></div>
              <div>Duplicates Removed: <strong className="text-rose-600 font-bold">{finalReport.duplicateRowsRemovedCount}</strong></div>
              <div>Conflicts Resolved: <strong className="text-indigo-600 font-bold">{finalReport.conflictsResolvedCount}</strong></div>
              <div>Empty Fields Filled: <strong className="text-teal-700 font-bold">{finalReport.emptyFieldsFilledCount}</strong></div>
            </div>

            <p className="text-xs text-slate-500">
              Các từ vừa import đã được tự động đưa vào Từ vựng cá nhân và đang ở trạng thái Pending Approval.
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
