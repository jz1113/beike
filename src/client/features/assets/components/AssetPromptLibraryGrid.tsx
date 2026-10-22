import { useState } from 'react';
import { CategorySkillPanel, type CategorySkillTab } from './CategorySkillPanel';
import { promptGroupSubcategoryOptions } from '../model/promptGroupFolders';
import type { ComponentProps, Dispatch, MouseEvent, RefObject, SetStateAction } from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';
import type { PromptGroupFolder } from '../model/promptGroupFolders';
import type { GalleryAtomType } from '../model/assetGalleryLabels';
import { promptGroupCategoryLabel } from '../model/promptGroupFolders';
import { promptLibraryEmptyCopy } from '../model/promptLibraryEmptyCopy';
import { PromptGroupCategoryFolders } from './PromptGroupCategoryFolders';
import { VirtualAssetGrid } from './VirtualAssetGrid';
import PromptAssetCard from './PromptAssetCard';
import { AssetLifecycleFilter } from './assetLibraryFilters';
import { AssetLibrarySortControls } from './assetLibraryFilters';
import { AssetTagFilter } from './assetLibraryFilters';

export function isGalleryAtomType(type: PromptAssetType): type is GalleryAtomType {
  return type === 'persona' || type === 'outfit' || type === 'scene';
}

interface Props {
  activeSubTab: PromptAssetType;
  items: AssetLibrarySlim[];
  displayedItems: AssetLibrarySlim[];
  promptGroupCategories: AssetProductCategory[];
  promptGroupAlbums: PromptAlbum[];
  categoryFolders: PromptGroupFolder[];
  subcategoryFolders: PromptGroupFolder[];
  assetScrollRef: RefObject<HTMLDivElement | null>;
  loadError: string | null;
  isLoading: boolean;
  folderRootVisible: boolean;
  subcategoryFoldersVisible: boolean;
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
  isAnyFilterActive: boolean;
  resetKey: string;
  returnToCategoryFolders: () => void;
  returnToSubcategoryFolders: () => void;
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
  onUseLearningReference: (id: string) => void;
  deleteAsset: (id: string, event: MouseEvent) => void | Promise<void>;
}

/** The library's folder and card presentation; mutations remain owned by its parent. */
export function AssetPromptLibraryGrid({
  activeSubTab, items, displayedItems, promptGroupCategories, promptGroupAlbums,
  categoryFolders, subcategoryFolders, assetScrollRef, loadError, isLoading,
  folderRootVisible, subcategoryFoldersVisible, promptGroupCategoryFilter,
  promptGroupSubcategoryFilter, currentFolderName, isBatchMode, selectedIds,
  openCardMenuId, copiedId, galleryLabels, showLifecycleFilters, lifecycleFilter,
  setLifecycleFilter, dynamicTagList, selectedTag, setSelectedTag, sortBy, setSortBy,
  isAnyFilterActive, resetKey, returnToCategoryFolders, returnToSubcategoryFolders,
  openCategoryFolder, openSubcategoryFolder, applyOrganization, showToast,
  refreshAssets, handleResetAllFilters, selectCard, openGroupPreview, openDetailItem,
  setAtomicPreview, setMoveItems, setOpenCardMenuId, setSelectedIds, setIsBatchMode,
  selectionAnchorRef, setAssetContextMenu, toggleSelectItem, toggleFavorite,
  setZoomImageUrl, withAssetDetail, handleCopyPrompt, getAssetPreviewText,
  setEditingItem, setTagEditItem, deleteAsset, onUseLearningReference,
}: Props) {
  const [learningTab, setLearningTab] = useState<CategorySkillTab>('references');
  const learningFolder = activeSubTab === 'full_prompt' && !folderRootVisible && !subcategoryFoldersVisible && !isBatchMode
    ? promptGroupSubcategoryOptions(promptGroupCategories, promptGroupCategoryFilter).find(option => option.id === promptGroupSubcategoryFilter)?.folderId : undefined;
  return (
      <div ref={assetScrollRef} data-asset-scroll className={`flex-1 min-h-0 bg-transparent overflow-y-auto px-5 sm:px-7 xl:px-8 pb-6 ${activeSubTab === 'full_prompt' ? 'pt-2' : activeSubTab === 'persona' || activeSubTab === 'outfit' ? 'pt-3' : 'pt-6'}`}>
        {loadError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          资产加载失败：{loadError}。{items.length ? '当前显示缓存内容，可能已过期。' : '尚不能判断资产库是否为空。'}
          <button type="button" onClick={refreshAssets} className="ml-3 underline">重新加载资产</button>
        </div>}
        {activeSubTab === 'full_prompt' && !folderRootVisible && !isBatchMode && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <nav aria-label="商品文件夹路径" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <button type="button" onClick={returnToCategoryFolders} className="font-medium text-indigo-600 hover:text-indigo-800">商品大类</button>
              <ChevronRight className="h-3.5 w-3.5" />
              {promptGroupSubcategoryFilter !== 'all' && promptGroupCategoryFilter !== 'all' ? <>
                <button type="button" onClick={returnToSubcategoryFolders} className="font-medium text-indigo-600 hover:text-indigo-800">{currentFolderName}</button>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {subcategoryFolders.find(folder => folder.id === promptGroupSubcategoryFilter)?.name || '待分类'}
                </span>
              </> : <span className="font-semibold text-slate-800 dark:text-slate-100">{currentFolderName}</span>}
            </nav>
            {!subcategoryFoldersVisible && <div className="flex flex-wrap items-center gap-2">
              {showLifecycleFilters && <AssetLifecycleFilter value={lifecycleFilter} onChange={setLifecycleFilter} items={items} />}
              <AssetTagFilter activeSubTab={activeSubTab} dynamicTagList={dynamicTagList} selectedTag={selectedTag} setSelectedTag={setSelectedTag} />
              <AssetLibrarySortControls showCount={false} isAnyFilterActive={false} displayedItemsCount={displayedItems.length} sortBy={sortBy} setSortBy={setSortBy} defaultSortTitle="按组号从小到大" />
            </div>}
          </div>
        )}
        {learningFolder && <CategorySkillPanel key={learningFolder} folderId={learningFolder} tab={learningTab} onTab={setLearningTab} onPreview={id => { const item = items.find(item => item.id === id); if (item) openGroupPreview(item); else showToast('来源图组已移除，请重新提炼技能'); }} onUseReference={onUseLearningReference} />}
        {folderRootVisible && isLoading && !items.length && !promptGroupCategories.length ? (
          <div className="flex flex-wrap gap-5 animate-pulse" aria-label="正在加载商品大类">
            {[1, 2, 3].map(n => <div key={n} className="h-40 w-[164px] rounded-2xl bg-slate-100/70 dark:bg-white/10" />)}
          </div>
        ) : folderRootVisible ? (
          <PromptGroupCategoryFolders
            categories={promptGroupCategories}
            folders={categoryFolders}
            total={items.length}
            onOpen={openCategoryFolder}
            onOpenAll={() => openCategoryFolder('all')}
            onChanged={applyOrganization}
            onNotice={showToast}
            onMoveGroups={ids => setMoveItems(items.filter(item => ids.includes(item.id)))}
            onArchived={refreshAssets}
          />
        ) : subcategoryFoldersVisible ? (
          <PromptGroupCategoryFolders
            categories={promptGroupCategories}
            folders={subcategoryFolders}
            total={categoryFolders.find(folder => folder.id === promptGroupCategoryFilter)?.items.length || 0}
            parentId={promptGroupCategoryFilter}
            onOpen={openSubcategoryFolder}
            onChanged={applyOrganization}
            onNotice={showToast}
            onMoveGroups={ids => setMoveItems(items.filter(item => ids.includes(item.id)))}
            onArchived={refreshAssets}
          />
        ) : learningFolder && learningTab !== 'references' ? null : displayedItems.length > 0 ? (
          <VirtualAssetGrid
            items={displayedItems}
            scrollRef={assetScrollRef}
            openItemId={openCardMenuId}
            resetKey={resetKey}
            renderItem={(item) => {
              const isSelected = selectedIds.includes(item.id);
              const listPosition = activeSubTab === 'full_prompt' && Number.isInteger(item.displayNumber) && Number(item.displayNumber) > 0
                ? Number(item.displayNumber)
                : undefined;
              const displayLabel = galleryLabels.get(item.id);
              return (
                <PromptAssetCard
                  key={item.id}
                  item={item}
                  activeSubTab={activeSubTab}
                  listPosition={listPosition}
                  displayLabel={displayLabel}
                  productCategoryLabel={activeSubTab === 'full_prompt' ? promptGroupCategoryLabel(item, promptGroupCategories, promptGroupAlbums) : undefined}
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
        ) : loadError ? null : (
          <div className="mx-auto flex min-h-[320px] w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-5" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{promptLibraryEmptyCopy(activeSubTab, isAnyFilterActive).title}</h3>
            <p className="mt-2 text-balance text-sm leading-6 text-slate-500 dark:text-slate-400">{promptLibraryEmptyCopy(activeSubTab, isAnyFilterActive).body}</p>
            {isAnyFilterActive && (
              <button type="button" onClick={handleResetAllFilters} className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
                清空筛选
              </button>
            )}
          </div>
        )}
      </div>

  );
}
