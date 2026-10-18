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
        <strong className="text-indigo-600 font-bold">{displayedItemsCount}</strong> {unit}
      </span>}
      <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-xl text-xs">
        {(['default', 'usage'] as const).map((key) => (
          <button
            key={key}
            type="button"
            title={key === 'default' ? defaultSortTitle : undefined}
            aria-label={key === 'default' && defaultSortTitle ? `默认排序：${defaultSortTitle}` : undefined}
            onClick={() => setSortBy(key)}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${sortBy === key ? 'bg-white text-slate-900 shadow-2xs font-bold dark:text-slate-100 dark:bg-[#18191c]' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'}`}
          >
            {key === 'default' ? '默认排序' : '使用最多'}
          </button>
        ))}
      </div>
    </div>
  );
}
