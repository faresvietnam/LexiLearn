import React from 'react';

export interface SubTabOption {
  id: string;
  label: string;
}

interface SubTabToggleProps {
  options: SubTabOption[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const SubTabToggle: React.FC<SubTabToggleProps> = ({
  options,
  activeId,
  onSelect,
}) => (
  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1 mb-6">
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        onClick={() => onSelect(option.id)}
        aria-pressed={activeId === option.id}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
          activeId === option.id
            ? 'bg-white text-indigo-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
