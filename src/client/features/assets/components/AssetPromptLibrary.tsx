import { AppearanceAudienceFilter } from './AppearanceAudienceControls';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import { fetchAssetDetail } from '@client/shared/api/assetLibraryCache';
import { useEffect, useMemo, useState, useRef, type MouseEvent } from 'react';
import AssetLibraryToolbar from './AssetLibraryToolbar';
import { useDeconstructQueue } from '../hooks/useDeconstructQueue';
import { useXhsBatchImport } from '../hooks/useXhsBatchImport';
import { useAssetLibraryFilters } from '../hooks/useAssetLibraryFilters';
import { usePromptGroupCategories } from '../hooks/usePromptGroupCategories';
import { AssetLibraryDialogs } from './AssetLibraryDialogs';

// 🚀 模块化提取能力
import { useLibraryUiState } from '../hooks/useLibraryUiState';
import { useAssetList } from '../hooks/useAssetList';
import { useAssetDetail } from '../hooks/useAssetDetail';
import { useAssetCrud } from '../hooks/useAssetCrud';
import { getAssetPreviewText as getAssetPreviewTextHelper } from '../model/assetApply';
import { AssetLifecycleFilter } from './AssetLifecycleFilter';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import { buildAssetGalleryLabels, type GalleryAtomType } from '../model/assetGalleryLabels';
import { buildPromptGroupFolders, buildPromptGroupSubcategoryFolders } from './PromptGroupCategoryFolders';
import { MovePromptGroupsDialog } from './MovePromptGroupsDialog';
import { PromptAssetContextMenu } from './PromptAssetContextMenu';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';

import { AssetPromptLibraryGrid, isGalleryAtomType } from './AssetPromptLibraryGrid';

interface Props {
  toolbarTarget?: HTMLElement | null;
  onEnterWorkshop?: () => void;
  initialSubTab?: PromptAssetType;
}

export default function AssetPromptLibrary({ onEnterWorkshop, toolbarTarget, initialSubTab = 'full_prompt' }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<PromptAssetType>(initialSubTab);
  const [showCategoryFolders, setShowCategoryFolders] = useState(initialSubTab === 'full_prompt');

  // UI 交互状态
  const { categories: promptGroupCategories, albums: promptGroupAlbums, applyOrganization } = usePromptGroupCategories(true);

  const {
    copiedId,
    setCopiedId,
    toastMsg,
    showToast,
    showMoreMenu,
    setShowMoreMenu,
    openCardMenuId,
    setOpenCardMenuId,
    zoomImageUrl,
    setZoomImageUrl,
  } = useLibraryUiState();

  // 资产列表与选择
  const {
    isLoading,
    loadError,
    setIsLoading,
    items,
    setItems,
    isBatchMode,
    setIsBatchMode,
    selectedIds,
    setSelectedIds,
    fetchAssets,
    refreshAssets,
    toggleSelectItem,
    handleCopyPrompt,
  } = useAssetList({
    activeSubTab,
    showToast,
    setCopiedId,
  });

  const {
    audienceFilter, setAudienceFilter,
    selectedTag,
    setSelectedTag,
    actionCategory,
    setActionCategory,
    actionSubCategory,
    setActionSubCategory,
    currentSubCategories,
    actionSubCategoryCounts,
    actionShotScale,
    setActionShotScale,
    actionShotScaleCounts,
    actionAnchor,
    setActionAnchor,
    actionCategoryCounts,
    availableAnchors,
    sortBy,
    setSortBy,
    lifecycleFilter,
    setLifecycleFilter,
    promptGroupCategoryFilter,
    setPromptGroupCategoryFilter,
    promptGroupSubcategoryFilter,
    setPromptGroupSubcategoryFilter,
    dynamicTagList,
    isAnyFilterActive,
    displayedItems,
    handleResetAllFilters,
  } = useAssetLibraryFilters(activeSubTab, items, promptGroupCategories, promptGroupAlbums);
  const categoryFolders = useMemo(
    () => buildPromptGroupFolders(items, promptGroupCategories, promptGroupAlbums),
    [items, promptGroupCategories, promptGroupAlbums],
  );
  const folderRootVisible = activeSubTab === 'full_prompt' && showCategoryFolders && promptGroupCategoryFilter === 'all' && !isBatchMode;
  const subcategoryFoldersVisible = activeSubTab === 'full_prompt' && !showCategoryFolders
    && promptGroupCategoryFilter !== 'all' && promptGroupCategoryFilter !== 'unclassified'
    && promptGroupCategoryFilter !== 'universal' && promptGroupSubcategoryFilter === 'all' && !isBatchMode;
  const subcategoryFolders = useMemo(
    () => buildPromptGroupSubcategoryFolders(items, promptGroupCategories, promptGroupAlbums, promptGroupCategoryFilter),
    [items, promptGroupCategories, promptGroupAlbums, promptGroupCategoryFilter],
  );
  const currentFolderName = promptGroupCategoryFilter === 'all'
    ? '全部母组'
    : categoryFolders.find(folder => folder.id === promptGroupCategoryFilter)?.name
      || promptGroupCategories.find(category => category.id === promptGroupCategoryFilter)?.name
      || '待分类';
  const showLifecycleFilters = activeSubTab !== 'full_prompt' || lifecycleFilter !== 'all' || items.some((item) => {
    const status = item.registry?.status || item.lifecycleStatus;
    return status && status !== 'published';
  });
  useEffect(() => {
    if (isBatchMode) setShowCategoryFolders(false);
  }, [isBatchMode]);
  useEffect(() => {
    if (activeSubTab === 'full_prompt') setShowCategoryFolders(true);
  }, [activeSubTab]);
  useEffect(() => {
    if (activeSubTab === 'persona' || activeSubTab === 'outfit') setSortBy('default');
  }, [activeSubTab, setSortBy]);
  const openCategoryFolder = (id: string) => {
    setSelectedTag(null);
    setLifecycleFilter('all');
    setPromptGroupCategoryFilter(id);
    setShowCategoryFolders(false);
    assetScrollRef.current?.scrollTo({ top: 0 });
  };
  const openSubcategoryFolder = (id: string) => {
    setPromptGroupSubcategoryFilter(id);
    assetScrollRef.current?.scrollTo({ top: 0 });
  };
  const returnToSubcategoryFolders = () => {
    setSelectedTag(null);
    setLifecycleFilter('all');
    setPromptGroupSubcategoryFilter('all');
    assetScrollRef.current?.scrollTo({ top: 0 });
  };
  const returnToCategoryFolders = () => {
    handleResetAllFilters();
    setSortBy('default');
    setPromptGroupCategoryFilter('all');
    setShowCategoryFolders(true);
    assetScrollRef.current?.scrollTo({ top: 0 });
  };
  const galleryLabels = useMemo(
    () => isGalleryAtomType(activeSubTab) ? buildAssetGalleryLabels(activeSubTab, items) : new Map<string, string>(),
    [activeSubTab, items],
  );

  // 详情与画廊
  const {
    detailItem,
    setDetailItem,
    detailLoading,
    detailActiveImageIndex,
    setDetailActiveImageIndex,
    openDetailItem,
  } = useAssetDetail({ activeSubTab });

  // 资产增删改查与工坊联动
  const {
    editingItem,
    setEditingItem,
    tagEditItem,
    setTagEditItem,
    isUpdating,
    handleClearAssets,
    toggleFavorite,
    deleteAsset,
    handleBatchDelete,
    handleDeduplicate,
    handleExportJsonBackup,
    handleImportJsonBackup,
    handleApplyToWorkshop,
    handleSaveEdit,
    handleSaveTagEdit,
  } = useAssetCrud({
    activeSubTab,
    items,
    setItems,
    selectedIds,
    setSelectedIds,
    setIsBatchMode,
    setIsLoading,
    detailItem,
    setDetailItem,
    showToast,
    fetchAssets,
    onEnterWorkshop,
  });

  const queueApi = useDeconstructQueue({
    showToast,
    onRefreshAssets: refreshAssets,
    defaultProductCategoryId: promptGroupCategoryFilter === 'all' || promptGroupCategoryFilter === 'unclassified'
      || promptGroupCategoryFilter === 'universal' ? null : promptGroupCategoryFilter,
    defaultProductSubcategory: promptGroupSubcategoryFilter === 'all' || promptGroupSubcategoryFilter === 'unclassified'
      ? null : promptGroupSubcategoryFilter,
    productCategories: promptGroupCategories,
  });
  const xhsImport = useXhsBatchImport({ queueApi, showToast, onRefreshAssets: refreshAssets });
  const { folderInputRef, setShowDeconstructModal, processFilesOrFolders } = queueApi;

  // 查看反推规格模态框
  const [showPromptSpecModal, setShowPromptSpecModal] = useState(false);
  const [groupPreview, setGroupPreview] = useState<{
    item: AssetLibrarySlim;
    listPosition?: number;
    initialIndex?: number;
  } | null>(null);
  const [atomicPreview, setAtomicPreview] = useState<{
    item: AssetLibrarySlim;
    type: GalleryAtomType;
    displayLabel: string;
  } | null>(null);
  const [moveItems, setMoveItems] = useState<AssetLibrarySlim[] | null>(null);
  const [assetContextMenu, setAssetContextMenu] = useState<{ x: number; y: number } | null>(null);
  const selectionAnchorRef = useRef<string | null>(null);
  const clearAssetSelection = () => {
    setAssetContextMenu(null);
    setSelectedIds([]);
    setIsBatchMode(false);
  };
  const selectCard = (event: MouseEvent, id: string) => {
    if (event.metaKey || event.ctrlKey) {
      setIsBatchMode(true);
      toggleSelectItem(id);
      selectionAnchorRef.current = id;
      return true;
    }
    if (event.shiftKey) {
      const start = displayedItems.findIndex(item => item.id === selectionAnchorRef.current);
      const end = displayedItems.findIndex(item => item.id === id);
      setSelectedIds(start < 0 ? [id] : displayedItems.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id));
      setIsBatchMode(true);
      return true;
    }
    if (isBatchMode) {
      toggleSelectItem(id);
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (isBatchMode && selectedIds.length === 0) setIsBatchMode(false);
  }, [isBatchMode, selectedIds.length, setIsBatchMode]);
  useEffect(() => {
    setAssetContextMenu(null);
    setSelectedIds([]);
    setIsBatchMode(false);
  }, [activeSubTab, selectedTag, promptGroupCategoryFilter, promptGroupSubcategoryFilter, actionCategory, actionSubCategory, actionShotScale, actionAnchor, sortBy, lifecycleFilter, audienceFilter, setSelectedIds, setIsBatchMode]);
  useEffect(() => {
    if (!isBatchMode) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !moveItems) {
        setAssetContextMenu(null);
        setSelectedIds([]);
        setIsBatchMode(false);
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [isBatchMode, moveItems, setSelectedIds, setIsBatchMode]);
  useEffect(() => {
    if (isBatchMode) setOpenCardMenuId(null);
  }, [isBatchMode, setOpenCardMenuId]);
  // 二级类目表管理模态框
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const importJsonRef = useRef<HTMLInputElement>(null);
  const assetScrollRef = useRef<HTMLDivElement>(null);

  const actionTabRef = useRef(activeSubTab);
  actionTabRef.current = activeSubTab;
  const withAssetDetail = async (item: { id: string }, action: (detail: Record<string, unknown>) => void) => {
    const detail = await fetchAssetDetail(activeSubTab, item.id);
    if (actionTabRef.current !== activeSubTab) return;
    if (!detail) { showToast('资产详情加载失败，请重试'); return; }
    action(detail);
  };
  const getAssetPreviewText = (item: any) => getAssetPreviewTextHelper(item, activeSubTab);
  const openGroupPreview = (item: AssetLibrarySlim, listPosition?: number) => {
    setOpenCardMenuId(null);
    setZoomImageUrl(null);
    setGroupPreview({ item, listPosition });
  };

  return (
    <div className="flex flex-col h-full bg-transparent text-slate-800 select-none">
      {/* 浮动 Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[130] px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in duration-200">
          {toastMsg}
        </div>
      )}

      <AssetLibraryToolbar
        toolbarTarget={toolbarTarget}
        hideSecondaryRow={(activeSubTab === 'full_prompt' && !isBatchMode) || activeSubTab === 'persona' || activeSubTab === 'outfit'}
        audienceFilters={(activeSubTab === 'persona' || activeSubTab === 'outfit') && <AppearanceAudienceFilter type={activeSubTab} value={audienceFilter} onChange={setAudienceFilter} items={items} />}
        statusFilters={showLifecycleFilters && <AssetLifecycleFilter value={lifecycleFilter} onChange={setLifecycleFilter} items={items} />}
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        setSelectedTag={setSelectedTag}
        onOpenDeconstruct={() => setShowDeconstructModal(true)}
        folderInputRef={folderInputRef}
        onFolderInputChange={(files) => processFilesOrFolders(files)}
        showMoreMenu={showMoreMenu}
        setShowMoreMenu={setShowMoreMenu}
        importJsonRef={importJsonRef}
        onImportJsonBackup={handleImportJsonBackup}
        onExportJsonBackup={handleExportJsonBackup}
        onDeduplicate={handleDeduplicate}
        onOpenPromptSpec={() => setShowPromptSpecModal(true)}
        onClearAssets={handleClearAssets}
        dynamicTagList={dynamicTagList}
        selectedTag={selectedTag}
        actionCategory={actionCategory}
        setActionCategory={setActionCategory}
        actionSubCategory={actionSubCategory}
        setActionSubCategory={setActionSubCategory}
        currentSubCategories={currentSubCategories}
        actionSubCategoryCounts={actionSubCategoryCounts}
        onOpenSubCategoryManager={() => setShowSubCategoryModal(true)}
        actionShotScale={actionShotScale}
        setActionShotScale={setActionShotScale}
        actionShotScaleCounts={actionShotScaleCounts}
        actionAnchor={actionAnchor}
        setActionAnchor={setActionAnchor}
        actionCategoryCounts={actionCategoryCounts}
        availableAnchors={availableAnchors}
        isAnyFilterActive={isAnyFilterActive}
        onResetAllFilters={handleResetAllFilters}
        displayedItemsCount={displayedItems.length}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />


      {isBatchMode && selectedIds.length > 0 && <div className="px-6 py-1 text-[11px] text-indigo-600">
        已选 {selectedIds.length} 项 · 右键操作，按 Esc 取消选择
      </div>}

      <AssetPromptLibraryGrid
        activeSubTab={activeSubTab} items={items} displayedItems={displayedItems}
        promptGroupCategories={promptGroupCategories} promptGroupAlbums={promptGroupAlbums}
        categoryFolders={categoryFolders} subcategoryFolders={subcategoryFolders}
        assetScrollRef={assetScrollRef} loadError={loadError} isLoading={isLoading}
        folderRootVisible={folderRootVisible} subcategoryFoldersVisible={subcategoryFoldersVisible}
        promptGroupCategoryFilter={promptGroupCategoryFilter} promptGroupSubcategoryFilter={promptGroupSubcategoryFilter}
        currentFolderName={currentFolderName} isBatchMode={isBatchMode} selectedIds={selectedIds}
        openCardMenuId={openCardMenuId} copiedId={copiedId} galleryLabels={galleryLabels}
        showLifecycleFilters={showLifecycleFilters} lifecycleFilter={lifecycleFilter} setLifecycleFilter={setLifecycleFilter}
        dynamicTagList={dynamicTagList} selectedTag={selectedTag} setSelectedTag={setSelectedTag}
        sortBy={sortBy} setSortBy={setSortBy} isAnyFilterActive={isAnyFilterActive}
        resetKey={JSON.stringify([activeSubTab, selectedTag, promptGroupCategoryFilter, promptGroupSubcategoryFilter, actionCategory, actionSubCategory, actionShotScale, actionAnchor, sortBy, lifecycleFilter, audienceFilter])}
        returnToCategoryFolders={returnToCategoryFolders} returnToSubcategoryFolders={returnToSubcategoryFolders}
        openCategoryFolder={openCategoryFolder} openSubcategoryFolder={openSubcategoryFolder}
        applyOrganization={applyOrganization} showToast={showToast} refreshAssets={refreshAssets}
        handleResetAllFilters={handleResetAllFilters} selectCard={selectCard} openGroupPreview={openGroupPreview}
        openDetailItem={openDetailItem} setAtomicPreview={setAtomicPreview} setMoveItems={setMoveItems}
        setOpenCardMenuId={setOpenCardMenuId} setSelectedIds={setSelectedIds} setIsBatchMode={setIsBatchMode}
        selectionAnchorRef={selectionAnchorRef} setAssetContextMenu={setAssetContextMenu}
        toggleSelectItem={toggleSelectItem} toggleFavorite={toggleFavorite} setZoomImageUrl={setZoomImageUrl}
        withAssetDetail={withAssetDetail} handleCopyPrompt={handleCopyPrompt} getAssetPreviewText={getAssetPreviewText}
        setEditingItem={setEditingItem} setTagEditItem={setTagEditItem} deleteAsset={deleteAsset}
      />

      {assetContextMenu && selectedIds.length > 0 && <PromptAssetContextMenu
        x={assetContextMenu.x} y={assetContextMenu.y} count={selectedIds.length}
        canMove={activeSubTab === 'full_prompt'}
        onMove={() => { setMoveItems(items.filter(item => selectedIds.includes(item.id))); setAssetContextMenu(null); }}
        onDelete={() => { setAssetContextMenu(null); void handleBatchDelete(); }}
        onClear={clearAssetSelection}
        onClose={() => setAssetContextMenu(null)}
      />}

      <AssetLibraryDialogs
        activeSubTab={activeSubTab} copiedId={copiedId}
        promptGroupCategories={promptGroupCategories} promptGroupAlbums={promptGroupAlbums}
        detail={{ item: detailItem, loading: detailLoading, imageIndex: detailActiveImageIndex, setItem: setDetailItem, setImageIndex: setDetailActiveImageIndex, onDelete: deleteAsset, onApply: handleApplyToWorkshop, getText: getAssetPreviewText }}
        edit={{ item: editingItem, setItem: setEditingItem, isUpdating, onSave: handleSaveEdit, tagItem: tagEditItem, setTagItem: setTagEditItem, onSaveTag: handleSaveTagEdit }}
        preview={{ group: groupPreview, setGroup: setGroupPreview, atom: atomicPreview, setAtom: setAtomicPreview, zoomUrl: zoomImageUrl, setZoomUrl: setZoomImageUrl, onCopy: handleCopyPrompt }}
        panels={{ specOpen: showPromptSpecModal, setSpecOpen: setShowPromptSpecModal, subcategoryOpen: showSubCategoryModal, setSubcategoryOpen: setShowSubCategoryModal, actionCategory, queueApi, xhsImport, showToast }}
      />

      {moveItems && <MovePromptGroupsDialog key={moveItems.map(item => item.id).join(',')}
        items={moveItems} categories={promptGroupCategories} albums={promptGroupAlbums}
        onClose={() => setMoveItems(null)}
        onMoved={() => {
          invalidateGlobalAssetCache();
          setMoveItems(null);
          setSelectedIds([]);
          setIsBatchMode(false);
          showToast('图组已移动到目标分类');
        }} />}

    </div>
  );
}
