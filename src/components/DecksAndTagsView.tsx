import React, { useState } from 'react';
import { FolderTree, Plus, Trash2, Tag as TagIcon, Folder } from 'lucide-react';
import { Deck, Tag, Word } from '../types';

interface DecksAndTagsViewProps {
  decks: Deck[];
  tags: Tag[];
  words: Word[];
  onCreateDeck: (deck: Deck) => Promise<boolean>;
  onCreateTag: (tag: Tag) => Promise<boolean>;
}

export const DecksAndTagsView: React.FC<DecksAndTagsViewProps> = ({
  decks,
  tags,
  words,
  onCreateDeck,
  onCreateTag,
}) => {
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [newDeckColor, setNewDeckColor] = useState('#3B82F6');

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#10B981');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    setIsCreatingDeck(true);
    let saved = false;
    try {
      saved = await onCreateDeck({
        id: `deck_${Date.now()}`,
        name: newDeckName.trim(),
        description: newDeckDesc.trim(),
        color: newDeckColor,
        createdAt: new Date().toISOString().split('T')[0],
      });
    } finally {
      setIsCreatingDeck(false);
    }
    if (saved) {
      setNewDeckName('');
      setNewDeckDesc('');
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setIsCreatingTag(true);
    let saved = false;
    try {
      saved = await onCreateTag({
        id: `tag_${Date.now()}`,
        name: newTagName.trim(),
        color: newTagColor,
      });
    } finally {
      setIsCreatingTag(false);
    }
    if (saved) setNewTagName('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quản lý Decks & Tags</h1>
        <p className="text-slate-500 text-sm">Phân loại từ vựng thành các bộ từ và nhãn chủ đề</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* DECKS SECTION */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Folder className="w-5 h-5 text-indigo-600" />
              <span>Danh sách Decks ({decks.length})</span>
            </h2>
          </div>

          <form onSubmit={handleCreateDeck} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="font-bold text-slate-800">Tạo Deck mới</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tên Deck (e.g. TOEFL 900)"
                required
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={newDeckColor}
                onChange={(e) => setNewDeckColor(e.target.value)}
                className="w-10 h-9 p-1 bg-white border border-slate-200 rounded-lg cursor-pointer"
              />
            </div>
            <input
              type="text"
              placeholder="Mô tả ngắn gọn"
              value={newDeckDesc}
              onChange={(e) => setNewDeckDesc(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" disabled={isCreatingDeck} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md shadow-indigo-100 transition disabled:opacity-60">
              {isCreatingDeck ? 'Đang tạo...' : 'Tạo Deck'}
            </button>
          </form>

          <div className="space-y-3">
            {decks.map((deck) => {
              const count = words.filter((w) => w.deckId === deck.id).length;
              return (
                <div
                  key={deck.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: deck.color }} />
                      <span className="font-bold text-slate-900 text-sm">{deck.name}</span>
                    </div>
                    {deck.description && <p className="text-xs text-slate-500">{deck.description}</p>}
                  </div>
                  <span className="px-3 py-1 rounded-full bg-indigo-50 text-xs font-mono font-bold text-indigo-700 border border-indigo-100">
                    {count} từ
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* TAGS SECTION */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TagIcon className="w-5 h-5 text-indigo-600" />
              <span>Danh sách Tags ({tags.length})</span>
            </h2>
          </div>

          <form onSubmit={handleCreateTag} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="font-bold text-slate-800">Tạo Tag mới</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tên Tag (e.g. Oxford 3000)"
                required
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-9 p-1 bg-white border border-slate-200 rounded-lg cursor-pointer"
              />
              <button type="submit" disabled={isCreatingTag} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md shadow-indigo-100 transition disabled:opacity-60">
                {isCreatingTag ? 'Đang tạo...' : 'Tạo Tag'}
              </button>
            </div>
          </form>

          <div className="flex gap-3 flex-wrap">
            {tags.map((tag) => {
              const count = words.filter((w) => w.tags.includes(tag.id)).length;
              return (
                <div
                  key={tag.id}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border text-slate-800"
                  style={{
                    borderColor: `${tag.color}40`,
                    backgroundColor: `${tag.color}15`,
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span>{tag.name}</span>
                  <span className="ml-1 text-[10px] font-mono font-bold text-slate-600">({count})</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
