import React, { useState } from 'react';
import { ShieldCheck, Check, X, GitMerge, Edit, AlertCircle, Globe, Lock } from 'lucide-react';
import { Word } from '../types';

interface AdminApprovalViewProps {
  words: Word[];
  /** Maps persisted creator user IDs to displayable email addresses. */
  creatorEmails?: Record<string, string>;
  onApproveWord: (wordId: string) => void | Promise<void>;
  onRejectWord: (wordId: string, reason: string) => void | Promise<void>;
  onMergeWithGlobal: (privateWordId: string, globalWordId: string) => void | Promise<void>;
}

export const AdminApprovalView: React.FC<AdminApprovalViewProps> = ({
  words,
  creatorEmails = {},
  onApproveWord,
  onRejectWord,
  onMergeWithGlobal,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'draft' | 'rejected' | 'global'>('pending');
  const [rejectReasonInput, setRejectReasonInput] = useState<{ [id: string]: string }>({});
  const [mergeTargetInput, setMergeTargetInput] = useState<{ [id: string]: string }>({});

  const pendingWords = words.filter((w) => w.approvalStatus === 'pending');
  const draftWords = words.filter((w) => w.approvalStatus === 'draft');
  const rejectedWords = words.filter((w) => w.approvalStatus === 'rejected');
  const globalWords = words.filter((w) => w.isGlobal);

  const displayedList =
    activeTab === 'pending'
      ? pendingWords
      : activeTab === 'draft'
      ? draftWords
      : activeTab === 'rejected'
      ? rejectedWords
      : globalWords;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-amber-500" />
            <span>Admin Word Submission Approval Portal</span>
          </h1>
          <p className="text-slate-500 text-sm">
            Duyệt bài từ vựng cá nhân để gộp (merge) vào Global Vocabulary chung cho toàn bộ người dùng
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-3 flex-wrap">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'pending'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Pending Submissions ({pendingWords.length})
        </button>
        <button
          onClick={() => setActiveTab('draft')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'draft'
              ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Drafts ({draftWords.length})
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'rejected'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Rejected ({rejectedWords.length})
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'global'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Global Vocabulary ({globalWords.length})
        </button>
      </div>

      {/* Submissions List */}
      <div className="space-y-4">
        {displayedList.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
            Không có từ vựng nào trong danh mục này.
          </div>
        ) : (
          displayedList.map((word) => (
            <div
              key={word.id}
              className="p-6 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm text-slate-800"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-bold text-slate-900">{word.word}</h3>
                    <span className="text-sm font-mono text-indigo-600 font-bold">{word.ipa}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                      {word.approvalStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Người tạo:{' '}
                    <strong className="text-slate-800">
                      {creatorEmails[word.createdBy] ?? word.createdBy}
                    </strong>{' '}
                    • Ngày gửi: {word.createdAt}
                  </p>
                </div>

                {/* Admin Actions for Pending / Draft */}
                {word.approvalStatus === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void onApproveWord(word.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Duyệt (Approve & Merge)</span>
                    </button>

                    <button
                      onClick={() => {
                        const reason = rejectReasonInput[word.id] || 'Nội dung chưa đạt tiêu chuẩn.';
                        void onRejectWord(word.id, reason);
                      }}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                    >
                      <X className="w-4 h-4" />
                      <span>Từ chối (Reject)</span>
                    </button>
                    {globalWords.length > 0 && (
                      <>
                        <select
                          aria-label={`Global target for ${word.word}`}
                          value={mergeTargetInput[word.id] || ''}
                          onChange={(event) => setMergeTargetInput({...mergeTargetInput, [word.id]: event.target.value})}
                          className="px-2 py-2 rounded-xl border border-slate-200 text-xs"
                        >
                          <option value="">Chọn Global để gộp</option>
                          {globalWords.map((globalWord) => (
                            <option key={globalWord.id} value={globalWord.id}>{globalWord.word}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!mergeTargetInput[word.id]}
                          onClick={() => void onMergeWithGlobal(word.id, mergeTargetInput[word.id])}
                          className="px-3 py-2 bg-indigo-600 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs"
                        >
                          Gộp
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Reject Reason input box */}
              {word.approvalStatus === 'pending' && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Lý do từ chối (nếu có)..."
                    value={rejectReasonInput[word.id] || ''}
                    onChange={(e) =>
                      setRejectReasonInput({ ...rejectReasonInput, [word.id]: e.target.value })
                    }
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
                  />
                </div>
              )}

              {/* Rejection Reason display */}
              {word.rejectionReason && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Lý do từ chối trước đó: {word.rejectionReason}</span>
                </div>
              )}

              {/* Word Meanings & Examples */}
              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                <div className="font-bold text-slate-400 uppercase tracking-wider">Danh sách nghĩa:</div>
                {word.meanings.map((m, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{m.meaning}</span>
                      <span className="text-indigo-400 font-mono">({m.partOfSpeech})</span>
                    </div>
                    {m.exampleSentences[0] && (
                      <p className="text-slate-400 italic">"{m.exampleSentences[0].sentence}"</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Morphology structure */}
              {word.wordStructure.length > 0 && (
                <div className="flex gap-2 flex-wrap pt-1 text-xs">
                  {word.wordStructure.map((p) => (
                    <span key={p.id} className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 font-mono text-emerald-300">
                      {p.text} ({p.type})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
