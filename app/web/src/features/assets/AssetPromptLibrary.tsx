import { fetchAssetDetail } from './assetLibraryCache';
import { VirtualAssetGrid } from './components/VirtualAssetGrid';
import { useState, useRef } from 'react';
import { Trash2, Layers } from 'lucide-react';
import AssetLibraryToolbar from './components/AssetLibraryToolbar';
import DeconstructModal from './components/DeconstructModal';
import { useDeconstructQueue } from './hooks/useDeconstructQueue';
import { useXhsBatchImport } from './hooks/useXhsBatchImport';
import { useAssetLibraryFilters } from './hooks/useAssetLibraryFilters';
import PromptAssetCard from './PromptAssetCard';
import { TagEditModal } from './components/TagEditModal';
import SubCategoryManagerModal from './components/SubCategoryManagerModal';

// 🚀 模块化提取能力
import { useLibraryUiState } from './hooks/useLibraryUiState';
import { useAssetList } from './hooks/useAssetList';
import { useAssetDetail } from './hooks/useAssetDetail';
import { useAssetCrud } from './hooks/useAssetCrud';
import { getAssetPreviewText as getAssetPreviewTextHelper } from './assetApply';
import { AssetEditModal } from './components/AssetEditModal';
import { AssetDetailModal } from './components/AssetDetailModal';
import { AssetPromptSpecModal } from './components/AssetPromptSpecModal';

interface Props {
  toolbarTarget?: HTMLElement | null;
  onEnterWorkshop?: () => void;
}

export default function AssetPromptLibrary({ onEnterWorkshop, toolbarTarget }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action'>('full_prompt');

  // UI 交互状态
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
    handleToggleSelectAll,
    handleCopyPrompt,
  } = useAssetList({
    activeSubTab,
    showToast,
    setCopiedId,
  });

  const {
    searchKeyword,
    setSearchKeyword,
    onlyFavorite,
    setOnlyFavorite,
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
    dynamicTagList,
    isAnyFilterActive,
    displayedItems,
    handleResetAllFilters,
  } = useAssetLibraryFilters(activeSubTab, items);

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

  const queueApi = useDeconstructQueue({ showToast, onRefreshAssets: refreshAssets });
  const xhsImport = useXhsBatchImport({ queueApi, showToast, onRefreshAssets: refreshAssets });
  const { folderInputRef, setShowDeconstructModal, processFilesOrFolders } = queueApi;

  // 查看大反推提示词模态框
  const [showPromptSpecModal, setShowPromptSpecModal] = useState(false);
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

  return (
    <div className="flex flex-col h-full bg-transparent text-slate-800 select-none">
      {/* 浮动 Toast 提示 */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in duration-200">
          {toastMsg}
        </div>
      )}

      <AssetLibraryToolbar
        toolbarTarget={toolbarTarget}
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        setSelectedTag={setSelectedTag}
        searchKeyword={searchKeyword}
        setSearchKeyword={setSearchKeyword}
        onlyFavorite={onlyFavorite}
        setOnlyFavorite={setOnlyFavorite}
        items={items}
        isBatchMode={isBatchMode}
        setIsBatchMode={setIsBatchMode}
        setSelectedIds={setSelectedIds}
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


      {/* 🌟 2. 批量管理悬浮工具条 (当处于批量模式时显示) */}
      {isBatchMode && (
        <div className="flex items-center justify-between px-6 lg:px-8 py-2.5 bg-indigo-50/90 border-b border-indigo-200/80 text-xs text-indigo-900 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <span className="font-bold">
              已选中 <span className="text-indigo-600 text-sm font-extrabold">{selectedIds.length}</span> / {items.length} 项资产
            </span>
            <button
              onClick={handleToggleSelectAll}
              className="px-2.5 py-1 bg-white hover:bg-indigo-100/60 rounded-lg border border-indigo-200 font-bold transition-colors cursor-pointer"
            >
              {selectedIds.length === items.length ? '取消全选' : '全选全部'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>批量彻底删除 ({selectedIds.length})</span>
            </button>
            <button
              onClick={() => {
                setIsBatchMode(false);
                setSelectedIds([]);
              }}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 font-medium cursor-pointer"
            >
              退出管理
            </button>
          </div>
        </div>
      )}

      {/* 🌟 3. 资产卡片瀑布流区域 */}
      <div ref={assetScrollRef} data-asset-scroll className="flex-1 min-h-0 bg-transparent overflow-y-auto pl-20 pr-5 sm:pl-24 sm:pr-7 xl:pr-8 py-6">
        {displayedItems.length > 0 ? (
          <VirtualAssetGrid
            items={displayedItems}
            scrollRef={assetScrollRef}
            openItemId={openCardMenuId}
            resetKey={JSON.stringify([activeSubTab, searchKeyword, onlyFavorite, selectedTag, actionCategory, actionSubCategory, actionShotScale, actionAnchor, sortBy])}
            renderItem={(item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <PromptAssetCard
                  key={item.id}
                  item={item}
                  activeSubTab={activeSubTab}
                  isBatchMode={isBatchMode}
                  isSelected={isSelected}
                  isMenuOpen={openCardMenuId === item.id}
                  copiedId={copiedId}
                  onCardClick={() => {
                    if (isBatchMode) {
                      toggleSelectItem(item.id);
                    } else {
                      openDetailItem(item);
                    }
                  }}
                  onToggleSelect={(e) => toggleSelectItem(item.id, e)}
                  onToggleFavorite={(e) => toggleFavorite(item, e)}
                  onToggleMenu={(e) => {
                    e.stopPropagation();
                    setOpenCardMenuId((prev) => (prev === item.id ? null : item.id));
                  }}
                  onViewDetail={(e) => {
                    e.stopPropagation();
                    openDetailItem(item);
                  }}
                  onPreviewImage={(url, e) => {
                    e.stopPropagation();
                    setZoomImageUrl(url);
                  }}
                  onApply={(e) => {
                    e.stopPropagation();
                    void withAssetDetail(item, handleApplyToWorkshop);
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
              <div key={n} className="h-44 bg-slate-100 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">暂无相关提示词资产</h3>
            <p className="text-xs text-slate-400 mt-1">
              {searchKeyword || onlyFavorite || selectedTag
                ? '未找到匹配的资产，请尝试清空筛选条件'
                : '通过上方「批量图集反推」或「小红书一键采编」快速扩充你的爆款资产库'}
            </p>
          </div>
        )}
      </div>

      {/* 🌟 详情查看模态框 */}
      <AssetDetailModal
        detailItem={detailItem}
        activeSubTab={activeSubTab}
        detailLoading={detailLoading}
        detailActiveImageIndex={detailActiveImageIndex}
        copiedId={copiedId}
        onClose={() => setDetailItem(null)}
        onSelectImageIndex={setDetailActiveImageIndex}
        onZoomImage={setZoomImageUrl}
        onCopyPrompt={handleCopyPrompt}
        onOpenTagEdit={(item) => setTagEditItem({ ...item })}
        onDeleteAsset={deleteAsset}
        onApplyToWorkshop={handleApplyToWorkshop}
        getAssetPreviewText={getAssetPreviewText}
      />

      {/* 🌟 编辑资产模态框 */}
      <AssetEditModal
        editingItem={editingItem}
        setEditingItem={setEditingItem}
        activeSubTab={activeSubTab}
        isUpdating={isUpdating}
        onSave={handleSaveEdit}
        onClose={() => setEditingItem(null)}
      />

      {/* 🌟 查看大反推提示词规范模态框 */}
      <AssetPromptSpecModal
        isOpen={showPromptSpecModal}
        onClose={() => setShowPromptSpecModal(false)}
        showToast={showToast}
      />

      <DeconstructModal queueApi={queueApi} xhsImport={xhsImport} showToast={showToast} />

      <SubCategoryManagerModal
        isOpen={showSubCategoryModal}
        onClose={() => setShowSubCategoryModal(false)}
        defaultCategoryId={
          actionCategory !== 'all' && actionCategory !== 'universal' ? actionCategory : 'jewelry'
        }
      />

      {/* 🔍 图片放大查看 Lightbox 模态框 */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out select-none"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative max-w-5xl max-h-[92vh] flex flex-col items-center cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏控制区 */}
            <div className="w-full flex items-center justify-between pb-3 text-white/80">
              <span className="text-xs font-medium text-white/60 bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-xs">
                原图高清预览 (按 Esc 或点击背景关闭)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.open(zoomImageUrl, '_blank')}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium transition-colors cursor-pointer"
                  title="在新标签页打开"
                >
                  新标签页打开
                </button>
              </div>
            </div>

            {/* 大图容器 */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/40">
              <img
                src={zoomImageUrl}
                alt="参考原图大图"
                className="max-w-full max-h-[80vh] sm:max-h-[84vh] object-contain rounded-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* 🏷️ 快速修改资产标签与景别分类模态框 */}
      {tagEditItem && (
        <TagEditModal
          item={tagEditItem}
          activeSubTab={activeSubTab}
          onClose={() => setTagEditItem(null)}
          onSave={handleSaveTagEdit}
          isUpdating={isUpdating}
        />
      )}

    </div>
  );
}
