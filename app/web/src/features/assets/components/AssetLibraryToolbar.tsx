import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Star,
  FolderOpen,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import type { ActionCategoryId, SubCategoryDef } from '@beike/shared/productCategoryHelpers';
import type { ActionShotScale } from '../hooks/useAssetLibraryFilters';
import { AssetLibraryMoreMenu } from './AssetLibraryMoreMenu';
import { AssetLibraryFilterBar } from './AssetLibraryFilterBar';

export type AssetSubTab = 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';

export type AssetLibraryToolbarProps = {
  toolbarTarget?: HTMLElement | null;
  activeSubTab: AssetSubTab;
  setActiveSubTab: (tab: AssetSubTab) => void;
  setSelectedTag: (tag: string | null) => void;
  searchKeyword: string;
  setSearchKeyword: (v: string) => void;
  onlyFavorite: boolean;
  setOnlyFavorite: (v: boolean) => void;
  items: unknown[];
  isBatchMode: boolean;
  setIsBatchMode: (v: boolean) => void;
  setSelectedIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  onOpenDeconstruct: () => void;
  folderInputRef: RefObject<HTMLInputElement | null>;
  onFolderInputChange: (files: FileList) => void;
  showMoreMenu: boolean;
  setShowMoreMenu: (v: boolean) => void;
  importJsonRef: RefObject<HTMLInputElement | null>;
  onImportJsonBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportJsonBackup: () => void;
  onDeduplicate: () => void;
  onOpenPromptSpec: () => void;
  onClearAssets: (scope: 'current' | 'all') => void;
  dynamicTagList: Array<{ tag: string; count: number }>;
  selectedTag: string | null;
  actionCategory?: ActionCategoryId | 'all';
  setActionCategory?: (cat: ActionCategoryId | 'all') => void;
  actionSubCategory?: string;
  setActionSubCategory?: (id: string) => void;
  currentSubCategories?: Array<SubCategoryDef>;
  actionSubCategoryCounts?: Record<string, number>;
  onOpenSubCategoryManager?: () => void;
  actionShotScale?: ActionShotScale;
  setActionShotScale?: (scale: ActionShotScale) => void;
  actionShotScaleCounts?: { all: number; macro_closeup: number; half_body: number; full_body: number };
  actionAnchor?: string | null;
  setActionAnchor?: (anchor: string | null) => void;
  actionCategoryCounts?: { all: number; universal: number; jewelry: number; digital_3c: number; apparel: number };
  availableAnchors?: Array<{ id: string; label: string; count: number }>;
  isAnyFilterActive: boolean;
  onResetAllFilters: () => void;
  displayedItemsCount: number;
  sortBy: 'default' | 'usage' | 'favorite';
  setSortBy: (v: 'default' | 'usage' | 'favorite') => void;
};

export default function AssetLibraryToolbar({
  toolbarTarget,
  activeSubTab,
  setActiveSubTab,
  setSelectedTag,
  searchKeyword,
  setSearchKeyword,
  onlyFavorite,
  setOnlyFavorite,
  items,
  isBatchMode,
  setIsBatchMode,
  setSelectedIds,
  onOpenDeconstruct,
  folderInputRef,
  onFolderInputChange,
  showMoreMenu,
  setShowMoreMenu,
  importJsonRef,
  onImportJsonBackup,
  onExportJsonBackup,
  onDeduplicate,
  onOpenPromptSpec,
  onClearAssets,
  dynamicTagList,
  selectedTag,
  actionCategory = 'all',
  setActionCategory,
  actionSubCategory = 'all',
  setActionSubCategory,
  currentSubCategories = [],
  actionSubCategoryCounts,
  onOpenSubCategoryManager,
  actionShotScale = 'all',
  setActionShotScale,
  actionShotScaleCounts,
  actionAnchor = null,
  setActionAnchor,
  actionCategoryCounts,
  availableAnchors,
  isAnyFilterActive,
  onResetAllFilters,
  displayedItemsCount,
  sortBy,
  setSortBy,
}: AssetLibraryToolbarProps) {
  const [wideLayout, setWideLayout] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1280px)');
    const update = () => setWideLayout(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const portalTarget = wideLayout ? toolbarTarget : null;
  const tabBtn = (tab: AssetSubTab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setActiveSubTab(tab);
        setSelectedTag(null);
      }}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
        activeSubTab === tab
          ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/10'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  const mainToolbar = (
      <div data-asset-main-toolbar className={`flex flex-wrap items-center justify-between gap-3 ${portalTarget ? 'h-12 bg-transparent' : 'px-6 lg:px-8 py-2.5 bg-transparent'}`}>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl">
            {tabBtn('full_prompt', '完整提示词')}
            {tabBtn('persona', '人物')}
            {tabBtn('outfit', '穿搭')}
            {tabBtn('scene', '场景')}
            {tabBtn('action', '动作')}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 hover:bg-slate-100 border border-slate-200/60 rounded-xl transition-colors w-48 sm:w-60 h-9">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索资产标题、特征、提示词..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavorite(!onlyFavorite)}
            className={`p-2 rounded-xl transition-colors cursor-pointer h-9 w-9 flex items-center justify-center ${
              onlyFavorite
                ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                : 'bg-slate-100 text-slate-500 hover:text-slate-700'
            }`}
            title={onlyFavorite ? '显示全部' : '仅看收藏'}
          >
            <Star className={`w-4 h-4 ${onlyFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>

          {(items.length > 0 || isBatchMode) && (
            <button
              type="button"
              onClick={() => {
                setIsBatchMode(!isBatchMode);
                if (isBatchMode) setSelectedIds([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer h-9 ${
                isBatchMode
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
              }`}
            >
              {isBatchMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              <span>批量管理</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenDeconstruct}
            className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer h-9"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>导入图集反推</span>
          </button>
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is standard for folder picker
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFolderInputChange(e.target.files);
              }
              e.target.value = '';
            }}
          />

          <AssetLibraryMoreMenu
            showMoreMenu={showMoreMenu}
            setShowMoreMenu={setShowMoreMenu}
            importJsonRef={importJsonRef}
            onImportJsonBackup={onImportJsonBackup}
            onExportJsonBackup={onExportJsonBackup}
            onDeduplicate={onDeduplicate}
            onOpenPromptSpec={onOpenPromptSpec}
            onClearAssets={onClearAssets}
          />
        </div>
      </div>

  );
  return (
    <>
      {portalTarget ? createPortal(mainToolbar, portalTarget) : mainToolbar}
      {/* 🌟 紧凑型专业复合过滤控制栏 (Filter Bar) */}
      <AssetLibraryFilterBar
        activeSubTab={activeSubTab}
        dynamicTagList={dynamicTagList}
        selectedTag={selectedTag}
        setSelectedTag={setSelectedTag}
        actionCategory={actionCategory}
        setActionCategory={setActionCategory}
        actionSubCategory={actionSubCategory}
        setActionSubCategory={setActionSubCategory}
        currentSubCategories={currentSubCategories}
        actionSubCategoryCounts={actionSubCategoryCounts}
        onOpenSubCategoryManager={onOpenSubCategoryManager}
        actionShotScale={actionShotScale}
        setActionShotScale={setActionShotScale}
        actionShotScaleCounts={actionShotScaleCounts}
        actionAnchor={actionAnchor}
        setActionAnchor={setActionAnchor}
        actionCategoryCounts={actionCategoryCounts}
        availableAnchors={availableAnchors}
        isAnyFilterActive={isAnyFilterActive}
        onResetAllFilters={onResetAllFilters}
        displayedItemsCount={displayedItemsCount}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />
    </>
  );
}
