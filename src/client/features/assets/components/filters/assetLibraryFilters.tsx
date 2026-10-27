import type { AssetSubTab } from '../../model/assetPromptConstants';
import DynamicTagDropdown from './DynamicTagDropdown';
import { ArrowDownWideNarrow } from 'lucide-react';

const colors: Record<AssetSubTab, string> = {
  full_prompt: 'bg-indigo-50 border-indigo-300 text-indigo-900 dark:bg-indigo-500/15 dark:border-indigo-400/40 dark:text-indigo-200',
  persona: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/15 dark:border-amber-400/40 dark:text-amber-200',
  outfit: 'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-500/15 dark:border-sky-400/40 dark:text-indigo-200',
  scene: 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-500/15 dark:border-emerald-400/40 dark:text-emerald-200',
  action: 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-500/15 dark:border-purple-400/40 dark:text-purple-200',
};

export function AssetTagFilter({
  activeSubTab,
  dynamicTagList,
  selectedTag,
  setSelectedTag,
}: {
  activeSubTab: AssetSubTab;
  dynamicTagList: Array<{ tag: string; count: number }>;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
}) {
  if (activeSubTab === 'action' || dynamicTagList.length === 0) return null;
  return <DynamicTagDropdown selectedTag={selectedTag} tagList={dynamicTagList} activeColorClass={colors[activeSubTab]} onSelectTag={setSelectedTag} />;
}

export function AssetLifecycleFilter({
  value,
  onChange,
  items,
}: {
  items: Array<{ registry?: { status?: string } | null; lifecycleStatus?: string }>;
  value: 'all' | 'pending_review' | 'needs_fix' | 'published';
  onChange: (value: 'all' | 'pending_review' | 'needs_fix' | 'published') => void;
}) {
  const options = [
    { id: 'all', label: '全部状态' },
    { id: 'pending_review', label: '待审核' },
    { id: 'needs_fix', label: '待修复' },
    { id: 'published', label: '已发布' },
  ] as const;
  const visible = options.filter(option => option.id === 'all' || option.id === value || items.some(item => (item.registry?.status || item.lifecycleStatus) === option.id));
  if (value === 'all' && visible.length < 3) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/70 bg-slate-100/80 p-1 dark:border-white/[0.08] dark:bg-white/[0.05]">
      {visible.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
            value === option.id
              ? 'bg-white text-indigo-600 shadow-2xs dark:bg-[#25262B] dark:text-indigo-300'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {option.label} <span className="ml-1 opacity-60">{option.id === 'all' ? items.length : items.filter((item) => (item.registry?.status || item.lifecycleStatus) === option.id).length}</span>
        </button>
      ))}
    </div>
  );
}

export function AssetLibrarySortControls({
  isAnyFilterActive,
  displayedItemsCount,
  unit = '条资产',
  showCount = true,
  defaultSortTitle,
  sortBy,
  setSortBy,
}: {
  isAnyFilterActive: boolean;
  displayedItemsCount: number;
  unit?: string;
  showCount?: boolean;
  defaultSortTitle?: string;
  sortBy: 'default' | 'usage' | 'favorite';
  setSortBy: (value: 'default' | 'usage' | 'favorite') => void;
}) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      {showCount && <span className="text-xs text-slate-500 font-medium select-none dark:text-slate-400">
        {isAnyFilterActive ? '筛选结果：' : ''}
        <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{displayedItemsCount}</strong> {unit}
      </span>}
      <label className="asset-sort-select" title={sortBy === 'default' ? defaultSortTitle : undefined}>
        <ArrowDownWideNarrow size={14} aria-hidden="true" />
        <select aria-label="素材排序" value={sortBy} onChange={event => setSortBy(event.target.value as 'default' | 'usage' | 'favorite')}>
          <option value="default">默认顺序</option>
          <option value="usage">使用最多</option>
          {sortBy === 'favorite' && <option value="favorite">收藏优先</option>}
        </select>
      </label>
    </div>
  );
}
