import { useMemo, useState } from 'react';
import { ChevronDown, Tag, X } from 'lucide-react';

export interface DynamicTagDropdownProps {
  selectedTag: string | null;
  tagList: { tag: string; count: number }[];
  activeColorClass?: string;
  onSelectTag: (tag: string | null) => void;
}

export default function DynamicTagDropdown({
  selectedTag,
  tagList,
  activeColorClass = 'bg-indigo-50 border-indigo-200 text-indigo-700',
  onSelectTag,
}: DynamicTagDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterKw, setFilterKw] = useState('');

  const filteredTags = useMemo(() => {
    if (!filterKw.trim()) return tagList;
    const kw = filterKw.trim().toLowerCase();
    return tagList.filter((t) => t.tag.toLowerCase().includes(kw));
  }, [tagList, filterKw]);

  if (tagList.length === 0) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none ${
          selectedTag
            ? `${activeColorClass} shadow-2xs ring-1 ring-black/5`
            : 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-700'
        }`}
      >
        <Tag className="w-3.5 h-3.5 opacity-70" />
        {selectedTag && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
        <span className="truncate max-w-[140px]">
          {selectedTag ? `已选: ${selectedTag}` : `标签分类 (${tagList.length})`}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-150 opacity-60 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {selectedTag && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTag(null);
          }}
          className="absolute -top-1 -right-1 p-0.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full cursor-pointer shadow-xs"
          title="清除标签筛选"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-50 w-64 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100 max-h-80 overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-500 border-b border-slate-100 mb-1.5">
              <span>动态标签词库 ({tagList.length} 种分类标签)</span>
              {selectedTag && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectTag(null);
                    setIsOpen(false);
                  }}
                  className="text-indigo-600 hover:underline cursor-pointer font-normal text-[11px]"
                >
                  显示全部
                </button>
              )}
            </div>

            {tagList.length > 8 && (
              <div className="mb-2 px-1">
                <input
                  type="text"
                  placeholder="搜索标签..."
                  value={filterKw}
                  onChange={(e) => setFilterKw(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs bg-slate-100 rounded-lg border-none focus:outline-none placeholder-slate-400"
                />
              </div>
            )}

            <div className="space-y-0.5 max-h-56 overflow-y-auto no-scrollbar">
              {filteredTags.map(({ tag, count }) => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onSelectTag(active ? null : tag);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                      active
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{tag}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${
                        active ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-400 font-normal'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
