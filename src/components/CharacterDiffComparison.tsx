import React from 'react';
import { diffChars } from 'diff';

interface CharacterDiffComparisonProps {
  userInput: string;
  expectedInput: string;
}

interface DiffRowProps {
  label: string;
  parts: ReturnType<typeof diffChars>;
  row: 'user' | 'expected';
}

const DiffRow: React.FC<DiffRowProps> = ({ label, parts, row }) => (
  <div
    className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 text-left font-mono text-sm sm:text-base"
    data-testid={`character-diff-${row}-row`}
  >
    <span className={`font-bold whitespace-nowrap ${row === 'user' ? 'text-rose-700' : 'text-emerald-700'}`}>
      {label}
    </span>
    <span className="min-w-0 break-all whitespace-pre-wrap text-slate-700">
      {parts.map((part, index) => {
        const isPlaceholder = (part.added && row === 'user') || (part.removed && row === 'expected');
        const className = isPlaceholder
          ? 'invisible rounded px-0.5 font-bold'
          : part.removed
            ? 'bg-rose-100 text-rose-800 rounded px-0.5 font-bold'
            : !part.added && row === 'expected'
              ? 'text-emerald-700 font-bold'
              : undefined;

        return (
          <span key={`${row}-${index}`} className={className}>
            {part.value}
          </span>
        );
      })}
    </span>
  </div>
);

export const CharacterDiffComparison: React.FC<CharacterDiffComparisonProps> = ({ userInput, expectedInput }) => {
  const parts = diffChars(userInput, expectedInput);

  return (
    <div className="space-y-2" aria-label="So sánh câu trả lời và đáp án theo ký tự">
      <DiffRow label="- Bạn nhập:" parts={parts} row="user" />
      <DiffRow label="+ Đáp án:" parts={parts} row="expected" />
    </div>
  );
};
