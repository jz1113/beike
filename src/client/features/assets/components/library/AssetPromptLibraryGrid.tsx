import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps, Dispatch, MouseEvent, ReactNode, RefObject, SetStateAction } from 'react';
import { ListChecks, X } from 'lucide-react';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import type { PromptGroupFolder } from '../../model/promptGroupFolders';
import type { GalleryAtomType } from '../../model/assetGalleryLabels';
import { promptGroupCategoryLabel } from '../../model/promptGroupFolders';
import { AssetLibraryEmptyState } from './AssetLibraryEmptyState';
import { PromptLibrarySidebar } from '../folders/PromptLibrarySidebar';
import { PromptCategoryManager } from '../folders/PromptCategoryManager';
import { VirtualAssetGrid } from './VirtualAssetGrid';
import PromptAssetCard from '../cards/PromptAssetCard';
import { AssetLifecycleFilter } from '../filters/assetLibraryFilters';
import { AssetLibrarySortControls } from '../filters/assetLibraryFilters';
import { AssetTagFilter } from '../filters/assetLibraryFilters';

export function isGalleryAtomType(type: PromptAssetType): type is GalleryAtomType {
  return type === 'persona' || type === 'outfit' || type === 'scene';
}

interface Props {
  onActionsTarget?: (element: HTMLDivElement | null) => void;
  onOpenSkills?: () => void;
  audienceFilters?: ReactNode;
  activeSubTab: PromptAssetType;
  items: AssetLibrarySlim[];
  displayedItems: AssetLibrarySlim[];
  promptGroupCategories: AssetProductCategory[];
  promptGroupAlbums: PromptAlbum[];
  subcategoryFolders: PromptGroupFolder[];
  assetScrollRef: RefObject<HTMLDivElement | null>;
  loadError: string | null;
  isLoading: boolean;
  promptGroupCategoryFilter: string;
  promptGroupSubcategoryFilter: string;
  currentFolderName: string;
  isBatchMode: boolean;
  selectedIds: string[];
  openCardMenuId: string | null;
  copiedId: string | null;
  galleryLabels: Map<string, string>;
  showLifecycleFilters: boolean;
  lifecycleFilter: ComponentProps<typeof AssetLifecycleFilter>['value'];
  setLifecycleFilter: (value: Props['lifecycleFilter']) => void;
  dynamicTagList: Array<{ tag: string; count: number }>;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  sortBy: 'default' | 'usage' | 'favorite';
  setSortBy: (value: Props['sortBy']) => void;
  hasContentFilters: boolean;
  clearContentFilters: () => void;
  resetKey: string;
  openCategoryFolder: (id: string) => void;
  openSubcategoryFolder: (id: string) => void;
  applyOrganization: (value: { categories: AssetProductCategory[]; albums: PromptAlbum[] }) => void;
  showToast: (message: string) => void;
  refreshAssets: () => void | Promise<void>;
  handleResetAllFilters: () => void;
  selectCard: (event: MouseEvent, id: string) => boolean;
  openGroupPreview: (item: AssetLibrarySlim, listPosition?: number) => void;
  openDetailItem: (item: AssetLibrarySlim & { listPosition?: number }) => void | Promise<void>;
  setAtomicPreview: (value: { item: AssetLibrarySlim; type: GalleryAtomType; displayLabel: string }) => void;
  setMoveItems: (items: AssetLibrarySlim[] | null) => void;
  setOpenCardMenuId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: (ids: string[]) => void;
  setIsBatchMode: (value: boolean) => void;
  selectionAnchorRef: RefObject<string | null>;
  setAssetContextMenu: (value: { x: number; y: number }) => void;
  toggleSelectItem: (id: string, event?: MouseEvent) => void;
  toggleFavorite: (item: AssetLibrarySlim, event: MouseEvent) => void | Promise<void>;
  setZoomImageUrl: (url: string | null) => void;
  withAssetDetail: (item: { id: string }, action: (detail: Record<string, unknown>) => void) => Promise<void>;
  handleCopyPrompt: (text: string, id: string) => void | Promise<void>;
  getAssetPreviewText: (item: Record<string, unknown>) => string;
  setEditingItem: (item: Record<string, unknown>) => void;
  setTagEditItem: (item: Record<string, unknown>) => void;
  onFeedReference: () => void;
  deleteAsset: (id: string, event: MouseEvent) => void | Promise<void>;
}

/** The library's folder and card presentation; mutations remain owned by its parent. */
export function AssetPromptLibraryGrid({
  onActionsTarget, onOpenSkills, audienceFilters, activeSubTab, items, displayedItems, promptGroupCategories, promptGroupAlbums,
  subcategoryFolders, assetScrollRef, loadError, isLoading,
  promptGroupCategoryFilter,
  promptGroupSubcategoryFilter, currentFolderName, isBatchMode, selectedIds,
  openCardMenuId, copiedId, galleryLabels, showLifecycleFilters, lifecycleFilter,
  setLifecycleFilter, dynamicTagList, selectedTag, setSelectedTag, sortBy, setSortBy,
  hasContentFilters, clearContentFilters, resetKey,
  openCategoryFolder, openSubcategoryFolder, applyOrganization, showToast,
  refreshAssets, handleResetAllFilters, selectCard, openGroupPreview, openDetailItem,
  setAtomicPreview, setMoveItems, setOpenCardMenuId, setSelectedIds, setIsBatchMode,
  selectionAnchorRef, setAssetContextMenu, toggleSelectItem, toggleFavorite,
  setZoomImageUrl, withAssetDetail, handleCopyPrompt, getAssetPreviewText,
  setEditingItem, setTagEditItem, deleteAsset, onFeedReference,
}: Props) {
  const [managingCategories, setManagingCategories] = useState(false);
  useEffect(() => {
    setManagingCategories(false);
  }, [activeSubTab]);
  const isGroup = activeSubTab === 'full_prompt';
  const categoryLabels = useMemo(() => new Map(activeSubTab === 'full_prompt' ? displayedItems.map(item => [item.id, promptGroupCategoryLabel(item, promptGroupCategories, promptGroupAlbums)]) : []), [activeSubTab, displayedItems, promptGroupCategories, promptGroupAlbums]);
  const sharedCategoryLabel = new Set(categoryLabels.values()).size === 1 ? categoryLabels.values().next().value : undefined;
  const hasUsageSort = sortBy !== 'default' || new Set(items.map(item => item.usageCount || 0)).size > 1;
  const typeTitle = { full_prompt: '全部母本', persona: '全部人物', outfit: '全部穿搭', scene: '全部场景', action: '全部动作' }[activeSubTab];
  return (
      <div className="asset-library-workspace">
        {activeSubTab === 'full_prompt' && <PromptLibrarySidebar items={items} categories={promptGroupCategories} albums={promptGroupAlbums}
          category={promptGroupCategoryFilter} subcategory={promptGroupSubcategoryFilter}
          onSelect={(category, subcategory) => { setManagingCategories(false); openCategoryFolder(category); if (subcategory) openSubcategoryFolder(subcategory); }}
          onManage={() => setManagingCategories(true)} onOpenSkills={onOpenSkills} />}
        <div className="asset-library-main">
        <div className="asset-gallery-heading">
          <nav aria-label="当前素材分类" className="asset-gallery-path">
            {isGroup && promptGroupCategoryFilter !== 'all' ? <>
              <button type="button" onClick={() => openCategoryFolder('all')}>全部母本</button><span>/</span>
              {promptGroupSubcategoryFilter === 'all' ? <strong aria-current="page">{currentFolderName}</strong> : <>
                <button type="button" onClick={() => openCategoryFolder(promptGroupCategoryFilter)}>{currentFolderName}</button><span>/</span>
                <strong aria-current="page">{subcategoryFolders.find(folder => folder.id === promptGroupSubcategoryFilter)?.name || '待分类'}</strong>
              </>}
            </> : <strong aria-current="page">{typeTitle}</strong>}
            <small role="status" aria-live="polite">{hasContentFilters ? '找到 ' : ''}{displayedItems.length} {isGroup ? '组' : '项'}</small>
          </nav>
          <div className="asset-gallery-controls">
          <div className="asset-gallery-filters">
            {showLifecycleFilters && <AssetLifecycleFilter value={lifecycleFilter} onChange={setLifecycleFilter} items={items} />}
            <AssetTagFilter activeSubTab={activeSubTab} dynamicTagList={dynamicTagList} selectedTag={selectedTag} setSelectedTag={setSelectedTag} />
            {hasUsageSort && <AssetLibrarySortControls showCount={false} isAnyFilterActive={false} displayedItemsCount={displayedItems.length} sortBy={sortBy} setSortBy={setSortBy} defaultSortTitle="按默认顺序排列" />}
            {!isBatchMode && displayedItems.length > 1 && <button type="button" onClick={() => setIsBatchMode(true)} className="asset-gallery-manage"><ListChecks size={14} />批量管理</button>}
            {hasContentFilters && <button type="button" onClick={clearContentFilters} className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><X className="h-3 w-3" />清除筛选</button>}
          </div>
          <div ref={onActionsTarget} className="asset-gallery-actions" />
          </div>
        </div>
        {audienceFilters && <div className="asset-gallery-audience">{audienceFilters}</div>}
        <div ref={assetScrollRef} data-asset-scroll className={`asset-library-gallery${isBatchMode ? ' is-batch-mode' : ''}`}>
        {loadError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          资产加载失败：{loadError}。{items.length ? '当前显示缓存内容，可能已过期。' : '尚不能判断资产库是否为空。'}
          <button type="button" onClick={refreshAssets} className="ml-3 underline">重新加载资产</button>
        </div>}
        {displayedItems.length > 0 ? (
          <VirtualAssetGrid
            items={displayedItems}
            scrollRef={assetScrollRef}
            openItemId={openCardMenuId}
            minCardWidth={208}
            resetKey={resetKey}
            renderItem={(item, index) => {
              const isSelected = selectedIds.includes(item.id);
              const listPosition = activeSubTab === 'full_prompt' ? index + 1 : undefined;
              const displayLabel = galleryLabels.get(item.id);
              return (
                <PromptAssetCard
                  key={item.id}
                  item={item}
                  activeSubTab={activeSubTab}
                  listPosition={listPosition}
                  displayLabel={displayLabel}
                  productCategoryLabel={!sharedCategoryLabel && promptGroupSubcategoryFilter === 'all' ? categoryLabels.get(item.id) : undefined}
                  isBatchMode={isBatchMode}
                  isSelected={isSelected}
                  isMenuOpen={openCardMenuId === item.id}
                  copiedId={copiedId}
                  onCardClick={event => {
                    if (selectCard(event, item.id)) return;
                    if (activeSubTab === 'full_prompt') {
                      openGroupPreview(item, listPosition);
                    } else if (isGalleryAtomType(activeSubTab)) {
                      setAtomicPreview({ item, type: activeSubTab, displayLabel: displayLabel || item.name || item.title || '资产' });
                    } else {
                      openDetailItem(item);
                    }
                  }}
                  onContextMenu={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenCardMenuId(null);
                    if (!selectedIds.includes(item.id)) setSelectedIds([item.id]);
                    setIsBatchMode(true);
                    selectionAnchorRef.current = item.id;
                    setAssetContextMenu({ x: event.clientX, y: event.clientY });
                  }}
                  onToggleSelect={(e) => toggleSelectItem(item.id, e)}
                  onToggleFavorite={(e) => {
                    setOpenCardMenuId(null);
                    void toggleFavorite(item, e);
                  }}
                  onToggleMenu={(e) => {
                    e.stopPropagation();
                    setOpenCardMenuId((prev) => (prev === item.id ? null : item.id));
                  }}
                  onViewDetail={(e) => {
                    e.stopPropagation();
                    if (activeSubTab === 'full_prompt') {
                      openGroupPreview(item, listPosition);
                    } else if (isGalleryAtomType(activeSubTab)) {
                      setAtomicPreview({ item, type: activeSubTab, displayLabel: displayLabel || item.name || item.title || '资产' });
                    } else {
                      openDetailItem(listPosition ? { ...item, listPosition } : item);
                    }
                  }}
                  onPreviewImage={(url, e) => {
                    e.stopPropagation();
                    if (isBatchMode) {
                      toggleSelectItem(item.id);
                      return;
                    }
                    if (activeSubTab === 'full_prompt') {
                      openGroupPreview(item, listPosition);
                    } else if (isGalleryAtomType(activeSubTab)) {
                      setAtomicPreview({ item, type: activeSubTab, displayLabel: displayLabel || item.name || item.title || '资产' });
                    } else {
                      setZoomImageUrl(url);
                    }
                  }}
                  onCopy={(e) => {
                    e.stopPropagation();
                    setOpenCardMenuId(null);
                    void withAssetDetail(item, detail => handleCopyPrompt(getAssetPreviewText(detail), item.id));
                  }}
                  onEdit={(e) => {
                    e.stopPropagation();
                    setOpenCardMenuId(null);
                    void withAssetDetail(item, detail => setEditingItem(detail));
                  }}
                  onMove={activeSubTab === 'full_prompt' ? (e) => {
                    e.stopPropagation();
                    setOpenCardMenuId(null);
                    setMoveItems([item]);
                  } : undefined}
                  onQuickEditTag={(targetItem, e) => {
                    e.stopPropagation();
                    setOpenCardMenuId(null);
                    setTagEditItem({ ...targetItem });
                  }}
                  onDelete={(e) => {
                    e.stopPropagation();
                    setOpenCardMenuId(null);
                    deleteAsset(item.id, e);
                  }}
                />
              );
            }}
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="aspect-[3/4] bg-white/50 rounded-2xl dark:bg-[#18191c]/95" />
            ))}
          </div>
        ) : loadError ? null : <AssetLibraryEmptyState tab={activeSubTab} filtered={hasContentFilters}
          folderName={activeSubTab === 'full_prompt' && promptGroupCategoryFilter !== 'all'
            ? promptGroupSubcategoryFilter !== 'all' ? subcategoryFolders.find(folder => folder.id === promptGroupSubcategoryFilter)?.name || '当前分类' : currentFolderName
            : undefined}
          onClearFilters={clearContentFilters} onBrowseAll={handleResetAllFilters} onFeedReference={onFeedReference} />}
        </div>
        </div>
        {activeSubTab === 'full_prompt' && managingCategories && <PromptCategoryManager items={items} categories={promptGroupCategories} albums={promptGroupAlbums}
          initialCategory={promptGroupCategoryFilter}
          onBrowse={(category, subcategory) => { openCategoryFolder(category); if (subcategory) openSubcategoryFolder(subcategory); }}
          onClose={() => setManagingCategories(false)} onChanged={applyOrganization} onNotice={showToast}
          onMoveGroups={ids => { setManagingCategories(false); setMoveItems(items.filter(item => ids.includes(item.id))); }} onArchived={refreshAssets} />}
      </div>
  );
}
