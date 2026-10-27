import { AppearanceAudienceFilter } from '../filters/AppearanceAudienceControls';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import { fetchAssetDetail } from '@client/shared/api/assetLibraryCache';
import { useEffect, useMemo, useState, useRef, type MouseEvent } from 'react';
import AssetLibraryToolbar from '../filters/AssetLibraryToolbar';
import { useDeconstructQueue } from '../../hooks/useDeconstructQueue';
import { useXhsBatchImport } from '../../hooks/useXhsBatchImport';
import { useAssetLibraryFilters } from '../../hooks/useAssetLibraryFilters';
import { usePromptGroupCategories } from '../../hooks/usePromptGroupCategories';
import { AssetLibraryDialogs } from '../dialogs/AssetLibraryDialogs';

// 🚀 模块化提取能力
import { useLibraryUiState } from '../../hooks/useLibraryUiState';
import { useAssetList } from '../../hooks/useAssetList';
import { useAssetDetail } from '../../hooks/useAssetDetail';
import { useAssetCrud } from '../../hooks/useAssetCrud';
import { getAssetPreviewText as getAssetPreviewTextHelper } from '../../model/assetApply';
import { AssetLifecycleFilter } from '../filters/assetLibraryFilters';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import { buildAssetGalleryLabels, type GalleryAtomType } from '../../model/assetGalleryLabels';
import { buildPromptGroupFolders, buildPromptGroupSubcategoryFolders, promptGroupSubcategoryOptions } from '../../model/promptGroupFolders';
import { CategorySkillsDialog } from '../folders/CategorySkillsDialog';
import { MovePromptGroupsDialog } from '../folders/MovePromptGroupsDialog';
import { PromptAssetContextMenu } from '../folders/PromptAssetContextMenu';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';

import { AssetPromptLibraryGrid, isGalleryAtomType } from './AssetPromptLibraryGrid';
import { AssetLibrarySelectionBar } from './AssetLibrarySelectionBar';
import './assetLibrary.css';
import './assetLibraryWorkspace.css';

interface Props {
  initialSubTab?: PromptAssetType;
  initialSkillsOpen?: boolean;
  navigationTarget?: HTMLElement | null;
}

function libraryItem(item: Record<string, unknown>): AssetLibrarySlim | null {
  if (typeof item.id !== 'string') return null;
  return { ...item, id: item.id } as AssetLibrarySlim;
}

export default function AssetPromptLibrary({ initialSubTab = 'full_prompt', initialSkillsOpen = false, navigationTarget }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<PromptAssetType>(initialSubTab);

  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);

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
  const subcategoryFolders = useMemo(
    () => buildPromptGroupSubcategoryFolders(items, promptGroupCategories, promptGroupAlbums, promptGroupCategoryFilter),
    [items, promptGroupCategories, promptGroupAlbums, promptGroupCategoryFilter],
  );
  const currentFolderName = promptGroupCategoryFilter === 'all'
    ? '全部图组母本'
    : categoryFolders.find(folder => folder.id === promptGroupCategoryFilter)?.name
      || promptGroupCategories.find(category => category.id === promptGroupCategoryFilter)?.name
      || '待分类';
  const showLifecycleFilters = activeSubTab !== 'full_prompt' || lifecycleFilter !== 'all' || items.some((item) => {
    const status = item.registry?.status || item.lifecycleStatus;
    return status && status !== 'published';
  });
  const hasContentFilters = activeSubTab === 'full_prompt'
    ? Boolean(selectedTag || lifecycleFilter !== 'all') : isAnyFilterActive;
  const clearContentFilters = () => {
    if (activeSubTab !== 'full_prompt') { handleResetAllFilters(); return; }
    setSelectedTag(null); setLifecycleFilter('all');
  };
  useEffect(() => {
    if (activeSubTab === 'persona' || activeSubTab === 'outfit') setSortBy('default');
  }, [activeSubTab, setSortBy]);
  const openCategoryFolder = (id: string) => {
    setSelectedTag(null);
    setLifecycleFilter('all');
    setPromptGroupCategoryFilter(id);
    assetScrollRef.current?.scrollTo({ top: 0 });
  };
  const openSubcategoryFolder = (id: string) => {
    setPromptGroupSubcategoryFilter(id);
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

  // 学习素材管理
  const {
    editingItem,
    setEditingItem,
    tagEditItem,
    setTagEditItem,
    isUpdating,
    isDeleting,
    toggleFavorite,
    deleteAsset,
    handleBatchDelete,
    handleExportJsonBackup,
    handleImportJsonBackup,
    handleSaveEdit,
    handleSaveTagEdit,
  } = useAssetCrud({
    activeSubTab,
    items,
    setItems,
    selectedIds,
    setSelectedIds,
    setIsBatchMode,
    detailItem,
    setDetailItem,
    showToast,
    fetchAssets,
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

  const [skillsOpen, setSkillsOpen] = useState(initialSkillsOpen);
  const [browseTarget, setBrowseTarget] = useState<{ category: string; subcategory: string } | null>(null);
  useEffect(() => {
    if (!browseTarget || activeSubTab !== 'full_prompt') return;
    setPromptGroupCategoryFilter(browseTarget.category);
    setPromptGroupSubcategoryFilter(browseTarget.subcategory);
    setBrowseTarget(null);
  }, [browseTarget, activeSubTab, setPromptGroupCategoryFilter, setPromptGroupSubcategoryFilter]);
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
    selectionAnchorRef.current = null;
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
    selectionAnchorRef.current = null;
    setAssetContextMenu(null);
    setSelectedIds([]);
    setIsBatchMode(false);
  }, [activeSubTab, selectedTag, promptGroupCategoryFilter, promptGroupSubcategoryFilter, actionCategory, actionSubCategory, actionShotScale, actionAnchor, sortBy, lifecycleFilter, audienceFilter, setSelectedIds, setIsBatchMode]);
  useEffect(() => {
    if (!isBatchMode) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !moveItems) {
        selectionAnchorRef.current = null;
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
  const getAssetPreviewText = (item: Record<string, unknown>) => getAssetPreviewTextHelper(item, activeSubTab);
  const openGroupPreview = (item: AssetLibrarySlim, listPosition?: number) => {
    setOpenCardMenuId(null);
    setZoomImageUrl(null);
    setGroupPreview({ item, listPosition });
  };

  return (
    <div className="asset-library flex h-full min-h-0 min-w-0 flex-col bg-transparent text-slate-800 select-none dark:text-slate-100">
      {/* 浮动 Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[130] px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in duration-200">
          {toastMsg}
        </div>
      )}

      <AssetLibraryToolbar
        navigationTarget={navigationTarget}
        actionsTarget={actionsTarget}
        hideSecondaryRow={activeSubTab === 'full_prompt' || activeSubTab === 'persona' || activeSubTab === 'outfit'}
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
        onOpenSkills={() => setSkillsOpen(true)}
        onRefresh={refreshAssets} isLoading={isLoading}
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


      {isBatchMode && <AssetLibrarySelectionBar count={selectedIds.length} total={displayedItems.length}
        itemLabel={activeSubTab === 'full_prompt' ? '组' : '项'}
        allSelected={displayedItems.length > 0 && displayedItems.every(item => selectedIds.includes(item.id))}
        canMove={activeSubTab === 'full_prompt'} busy={isUpdating || isDeleting}
        onSelectAll={() => setSelectedIds(displayedItems.every(item => selectedIds.includes(item.id)) ? [] : displayedItems.map(item => item.id))}
        onMove={() => setMoveItems(items.filter(item => selectedIds.includes(item.id)))}
        onDelete={() => void handleBatchDelete()} onClose={clearAssetSelection} />}

      <AssetPromptLibraryGrid
        onActionsTarget={setActionsTarget}
        onOpenSkills={() => setSkillsOpen(true)}
        audienceFilters={(activeSubTab === 'persona' || activeSubTab === 'outfit') && <AppearanceAudienceFilter type={activeSubTab} value={audienceFilter} onChange={setAudienceFilter} items={items} />}
        activeSubTab={activeSubTab} items={items} displayedItems={displayedItems}
        promptGroupCategories={promptGroupCategories} promptGroupAlbums={promptGroupAlbums}
        subcategoryFolders={subcategoryFolders}
        assetScrollRef={assetScrollRef} loadError={loadError} isLoading={isLoading}
        promptGroupCategoryFilter={promptGroupCategoryFilter} promptGroupSubcategoryFilter={promptGroupSubcategoryFilter}
        currentFolderName={currentFolderName} isBatchMode={isBatchMode} selectedIds={selectedIds}
        openCardMenuId={openCardMenuId} copiedId={copiedId} galleryLabels={galleryLabels}
        showLifecycleFilters={showLifecycleFilters} lifecycleFilter={lifecycleFilter} setLifecycleFilter={setLifecycleFilter}
        dynamicTagList={dynamicTagList} selectedTag={selectedTag} setSelectedTag={setSelectedTag}
        sortBy={sortBy} setSortBy={setSortBy} hasContentFilters={hasContentFilters} clearContentFilters={clearContentFilters}
        resetKey={JSON.stringify([activeSubTab, selectedTag, promptGroupCategoryFilter, promptGroupSubcategoryFilter, actionCategory, actionSubCategory, actionShotScale, actionAnchor, sortBy, lifecycleFilter, audienceFilter])}
        openCategoryFolder={openCategoryFolder} openSubcategoryFolder={openSubcategoryFolder}
        applyOrganization={applyOrganization} showToast={showToast} refreshAssets={refreshAssets}
        handleResetAllFilters={handleResetAllFilters} selectCard={selectCard} openGroupPreview={openGroupPreview}
        openDetailItem={openDetailItem} setAtomicPreview={setAtomicPreview} setMoveItems={setMoveItems}
        setOpenCardMenuId={setOpenCardMenuId} setSelectedIds={setSelectedIds} setIsBatchMode={setIsBatchMode}
        selectionAnchorRef={selectionAnchorRef} setAssetContextMenu={setAssetContextMenu}
        toggleSelectItem={toggleSelectItem} toggleFavorite={toggleFavorite} setZoomImageUrl={setZoomImageUrl}
        withAssetDetail={withAssetDetail} handleCopyPrompt={handleCopyPrompt} getAssetPreviewText={getAssetPreviewText}
        setEditingItem={(item) => { const next = libraryItem(item); if (next) setEditingItem(next); }}
        setTagEditItem={(item) => { const next = libraryItem(item); if (next) setTagEditItem(next); }}
        deleteAsset={deleteAsset} onFeedReference={() => setShowDeconstructModal(true)}
      />

      {assetContextMenu && selectedIds.length > 0 && <PromptAssetContextMenu
        x={assetContextMenu.x} y={assetContextMenu.y} count={selectedIds.length}
        canMove={activeSubTab === 'full_prompt'}
        onMove={() => { setMoveItems(items.filter(item => selectedIds.includes(item.id))); setAssetContextMenu(null); }}
        onDelete={() => { setAssetContextMenu(null); void handleBatchDelete(); }}
        onClear={clearAssetSelection}
        onClose={() => setAssetContextMenu(null)}
      />}

      {skillsOpen && <CategorySkillsDialog categories={promptGroupCategories} albums={promptGroupAlbums}
        initialFolder={promptGroupSubcategoryOptions(promptGroupCategories, promptGroupCategoryFilter).find(option => option.id === promptGroupSubcategoryFilter)?.folderId}
        onBrowse={(category, subcategory) => { setSkillsOpen(false); setActiveSubTab('full_prompt'); setBrowseTarget({ category, subcategory }); }}
        onClose={() => setSkillsOpen(false)} onPreview={id => {
          void fetchAssetDetail('full_prompt', id).then(detail => { const item = detail && libraryItem(detail); if (!item) throw new Error('来源图组不可用'); setSkillsOpen(false); openGroupPreview(item, item.displayNumber ?? undefined); }).catch(error => showToast(error instanceof Error ? error.message : '图组读取失败'));
        }} />}
      <AssetLibraryDialogs
        activeSubTab={activeSubTab} copiedId={copiedId}
        promptGroupCategories={promptGroupCategories} promptGroupAlbums={promptGroupAlbums}
        detail={{ item: detailItem, loading: detailLoading, imageIndex: detailActiveImageIndex, setItem: setDetailItem, setImageIndex: setDetailActiveImageIndex, onDelete: deleteAsset, getText: getAssetPreviewText }}
        edit={{ item: editingItem, setItem: setEditingItem, isUpdating, onSave: handleSaveEdit, tagItem: tagEditItem, setTagItem: setTagEditItem, onSaveTag: handleSaveTagEdit }}
        preview={{ group: groupPreview, setGroup: setGroupPreview, atom: atomicPreview, setAtom: setAtomicPreview, zoomUrl: zoomImageUrl, setZoomUrl: setZoomImageUrl, onCopy: handleCopyPrompt }}
        panels={{ subcategoryOpen: showSubCategoryModal, setSubcategoryOpen: setShowSubCategoryModal, actionCategory, queueApi, xhsImport, showToast }}
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
