import React from 'react';
import {
  Search,
  ChevronDown,
  ListChecks,
  X,
} from 'lucide-react';
import { useI18n } from '@client/shared/i18n';
import MaterialFilterDropdown from './MaterialFilterDropdown';

export interface MaterialLibraryToolbarProps {
  viewMode: 'flat' | 'project';
  onViewModeChange: (mode: 'flat' | 'project') => void;
  mediaCategory: 'all' | 'image' | 'video' | 'audio' | 'document';
  onMediaCategoryChange: (cat: 'all' | 'image' | 'video' | 'audio' | 'document') => void;
  searchInput: string;
  onSearchInputChange: (query: string) => void;
  sortOrder: 'newest' | 'oldest' | 'name';
  onSortOrderChange: (order: 'newest' | 'oldest' | 'name') => void;
  isBatchMode: boolean;
  onEnterBatchMode: () => void;
  onExitBatchMode: () => void;
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  statusFilter?: string;
  onStatusFilterChange?: (val: string) => void;
  timeFilter?: string;
  onTimeFilterChange?: (val: string) => void;
  displaySize?: string;
  onDisplaySizeChange?: (val: string) => void;
}

export function MaterialLibraryToolbar({
  viewMode,
  onViewModeChange,
  mediaCategory,
  onMediaCategoryChange,
  searchInput,
  onSearchInputChange,
  sortOrder,
  onSortOrderChange,
  isBatchMode,
  onEnterBatchMode,
  onExitBatchMode,
  selectedCount,
  totalCount,
  onToggleSelectAll,
}: MaterialLibraryToolbarProps) {
  const { t } = useI18n();
  const isAllSelected = selectedCount > 0 && selectedCount === totalCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-1 pb-5 border-b border-slate-200/60 dark:border-white/10 mb-3">
      {/* 左侧区域：【全部 / 图片 / 视频 / 音频 / 文档】胶囊容器 + 视图切换下拉 */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        {viewMode === 'flat' && (
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-slate-100/90 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shadow-2xs">
            {(
              [
                { id: 'all', label: t('assets.all') },
                { id: 'image', label: t('assets.image') },
                { id: 'video', label: t('assets.video') },
                { id: 'audio', label: t('assets.audio') },
                { id: 'document', label: t('assets.document') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onMediaCategoryChange(tab.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  mediaCategory === tab.id
                    ? 'bg-white dark:bg-[#20252F] text-slate-900 dark:text-white font-semibold shadow-2xs'
                    : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* 细分割竖线 */}
        {viewMode === 'flat' && (
          <div className="h-4 w-px bg-slate-200 dark:bg-white/10 shrink-0 mx-0.5 hidden sm:block" />
        )}

        {/* 平铺视图 ˅ / 项目视图 ˅ 下拉 */}
        <div className="relative flex items-center">
          <select
            value={viewMode}
            onChange={(e) => onViewModeChange(e.target.value as 'flat' | 'project')}
            className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-800 dark:text-[#EDEDED] border border-transparent dark:border-white/10 text-xs font-semibold outline-none cursor-pointer h-8 transition-colors"
          >
            <option value="flat" className="dark:bg-[#1B1B1E] dark:text-[#EDEDED]">{t('assets.flatView')}</option>
            <option value="project" className="dark:bg-[#1B1B1E] dark:text-[#EDEDED]">{t('assets.projectView')}</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-[#8E8E93] absolute right-2 pointer-events-none" />
        </div>
      </div>

      {/* 右侧区域：批量模式展示控制条；普通模式展示搜索+排序+批量操作入口 */}
      {isBatchMode ? (
        <div className="flex items-center gap-3 shrink-0 animate-in fade-in duration-150">
          <span className="text-xs text-slate-500 dark:text-[#8E8E93] font-medium">
            {t('assets.selectedCount', { count: selectedCount })}
          </span>

          {/* 全选 / 取消全选 胶囊按钮 */}
          <button
            type="button"
            onClick={onToggleSelectAll}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
              isAllSelected
                ? 'bg-slate-200/90 dark:bg-white/20 border-slate-300 dark:border-white/30 text-slate-900 dark:text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200/80 dark:hover:bg-white/10 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-[#EDEDED] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isAllSelected ? t('assets.deselectAll') : t('assets.selectAll')}
          </button>

          <div className="h-3.5 w-px bg-slate-200 dark:bg-white/10" />

          {/* 退出批量操作模式 */}
          <button
            type="button"
            onClick={onExitBatchMode}
            title={`${t('assets.exitBatch')} (Esc)`}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-[#8E8E93] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* 搜索资产输入框 */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400 dark:text-[#8E8E93]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder={t('assets.searchPlaceholder')}
              className="w-32 sm:w-36 pl-8 pr-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200/60 dark:hover:bg-white/10 focus:bg-white dark:focus:bg-[#1B1B1E] text-xs text-slate-800 dark:text-[#EDEDED] placeholder-slate-400 dark:placeholder-[#636366] outline-none border border-transparent dark:border-white/10 focus:border-slate-300 dark:focus:border-white/20 transition-all h-8"
            />
          </div>

          {/* 排序下拉 */}
          <MaterialFilterDropdown
            label={t('assets.sort')}
            value={sortOrder}
            minWidth="w-36"
            options={[
              { id: 'newest', label: t('assets.sortNewest') },
              { id: 'oldest', label: t('assets.sortOldest') },
              { id: 'name', label: t('assets.sortName') },
            ]}
            onChange={(val) => onSortOrderChange(val)}
          />

          {/* 批量操作按钮（平铺视图与项目视图均支持） */}
          <button
            type="button"
            onClick={onEnterBatchMode}
            title={t('assets.batchAction')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-[#EDEDED] hover:text-slate-900 dark:hover:text-white border border-transparent dark:border-white/10 text-xs font-medium cursor-pointer h-8 transition-colors select-none"
          >
            <ListChecks className="w-4 h-4" />
            <span className="hidden sm:inline">{t('assets.batchAction')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default MaterialLibraryToolbar;
