import { type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
} from 'lucide-react';
import type { ActionCategoryId, SubCategoryDef } from '@shared/domain/products/productCategory';
import type { ActionShotScale } from '../../hooks/useAssetLibraryFilters';
import { AssetLibraryMoreMenu } from './AssetLibraryMoreMenu';
import { AssetLibraryFilterBar } from './AssetLibraryFilterBar';
import type { ReactNode } from 'react';
import { ASSET_TAB_HINT } from '../../model/promptLibraryEmptyCopy';

import type { AssetSubTab } from '../../model/assetPromptConstants';
export type { AssetSubTab } from '../../model/assetPromptConstants';

export type AssetLibraryToolbarProps = {
  navigationTarget?: HTMLElement | null;
  actionsTarget?: HTMLElement | null;
  statusFilters?: ReactNode;
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
  onOpenSkills: () => void;
  onRefresh: () => void;
  isLoading: boolean;
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
  navigationTarget,
  actionsTarget,
  statusFilters,
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
  onOpenSkills,
  onRefresh, isLoading,
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
  const tabBtn = (tab: AssetSubTab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setActiveSubTab(tab);
        setSelectedTag(null);
      }}
      className="asset-type-tab"
      aria-pressed={activeSubTab === tab}
      title={ASSET_TAB_HINT[tab]}
    >
      {label}
    </button>
  );

  const tabNavigation = (
      <nav className="asset-type-navigation" aria-label="资产类型">
        {tabBtn('full_prompt', '图组母本')}
        {tabBtn('persona', '人物')}
        {tabBtn('outfit', '穿搭')}
        {tabBtn('scene', '场景')}
      </nav>
  );

  const actionControls = (
    <div className="asset-library-actions">
      <button
        type="button"
        onClick={onOpenDeconstruct}
        className="asset-feed-button"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span>投喂参考图</span>
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
        onRefresh={onRefresh}
        isLoading={isLoading}
        onOpenSkills={activeSubTab === 'full_prompt' ? undefined : onOpenSkills}
      />
    </div>
  );

  const toolbarControls = (
        <div className="asset-library-tools">
          {actionControls}
        </div>
  );

  return (
    <>
      {navigationTarget ? createPortal(tabNavigation, navigationTarget) : <div className="asset-type-fallback">{tabNavigation}</div>}
      {actionsTarget && createPortal(toolbarControls, actionsTarget)}
      {activeSubTab === 'action' && <AssetLibraryFilterBar
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
      />}
    </>
  );
}
