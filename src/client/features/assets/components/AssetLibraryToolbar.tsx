import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
} from 'lucide-react';
import type { ActionCategoryId, SubCategoryDef } from '@shared/domain/products/productCategory';
import type { ActionShotScale } from '../hooks/useAssetLibraryFilters';
import { AssetLibraryMoreMenu } from './AssetLibraryMoreMenu';
import { AssetLibraryFilterBar } from './AssetLibraryFilterBar';
import type { ReactNode } from 'react';
import { ASSET_TAB_HINT } from '../model/promptLibraryEmptyCopy';

import type { AssetSubTab } from '../model/assetPromptConstants';
export type { AssetSubTab } from '../model/assetPromptConstants';

export type AssetLibraryToolbarProps = {
  toolbarTarget?: HTMLElement | null;
  statusFilters?: ReactNode;
  audienceFilters?: ReactNode;
  activeSubTab: AssetSubTab;
  hideSecondaryRow?: boolean;
  setActiveSubTab: (tab: AssetSubTab) => void;
  setSelectedTag: (tag: string | null) => void;
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
  actionCategoryCounts?: Partial<Record<ActionCategoryId | 'all', number>>;
  availableAnchors?: Array<{ id: string; label: string; count: number }>;
  isAnyFilterActive: boolean;
  onResetAllFilters: () => void;
  displayedItemsCount: number;
  sortBy: 'default' | 'usage' | 'favorite';
  setSortBy: (v: 'default' | 'usage' | 'favorite') => void;
};

export default function AssetLibraryToolbar({
  toolbarTarget,
  statusFilters,
  audienceFilters,
  activeSubTab,
  hideSecondaryRow,
  setActiveSubTab,
  setSelectedTag,
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
  // 顶栏需同时容纳品牌、资产分类、右侧模块导航；只在充足宽度时挂到顶栏。
  const [wideLayout, setWideLayout] = useState(() => window.matchMedia('(min-width: 1536px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1536px)');
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
      aria-pressed={activeSubTab === tab}
      title={ASSET_TAB_HINT[tab]}
    >
      {label}
    </button>
  );

  // 分类切换属于内容区的导航。让它靠左放在资产列表上方，避免与居中的工坊模块导航
  // 和右侧管理操作抢占同一条顶栏。
  const tabNavigation = (
    <div className="flex items-center gap-2.5 flex-wrap shrink-0">
      <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl" aria-label="资产类型">
        {tabBtn('full_prompt', '图组母本')}
        <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />
        {tabBtn('persona', '人物')}
        {tabBtn('outfit', '穿搭')}
        {tabBtn('scene', '场景')}
      </div>
      <span className="text-xs text-slate-500">{ASSET_TAB_HINT[activeSubTab]}</span>
    </div>
  );

  const actionControls = (
    <div className="flex items-center gap-2.5 shrink-0">
      <button
        type="button"
        onClick={onOpenDeconstruct}
        className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer h-9"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span>导入图集并提取</span>
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
  );

  return (
    <>
      {/* 窄屏没有顶栏挂载点时，让操作控件独占一行；分类导航始终紧跟“维度筛选”。 */}
      {!portalTarget && (
        <div
          data-asset-main-toolbar
          className="flex items-center justify-end gap-3 flex-wrap px-5 sm:px-7 xl:px-8 py-1.5 bg-transparent"
        >
          {actionControls}
        </div>
      )}
      {portalTarget && createPortal(
        <div className="flex h-12 min-w-0 items-center justify-end bg-transparent">
          {actionControls}
        </div>,
        portalTarget,
      )}
      {/* 🌟 紧凑型专业复合过滤控制栏 (Filter Bar) */}
      <AssetLibraryFilterBar
        navigation={<>{tabNavigation}{audienceFilters}</>}
        hideSecondaryRow={hideSecondaryRow}
        statusFilters={statusFilters}
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
