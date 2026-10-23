import React, { useCallback, useMemo, useState } from 'react';
import {
  CheckCheck,
  ChevronRight,
  Palette,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { BatchProductItem, TypedProductImage } from '../../model/batchTypes';
import { setPrimaryProductImage } from '../../model/collection/batchImageSelection';
import { extractProductSkuInfo } from '../../model/collection/skuColorExtraction';
import BatchProductImageGrid, { type GalleryViewMode, type GridDensity } from './BatchProductImageGrid';
import BatchSelectedFilmstrip, { type SelectedImageItem } from './BatchSelectedFilmstrip';
import GalleryViewModeControl from './GalleryViewModeControl';
import ImageTypeFilterTabs from '../delivery/ImageTypeFilterTabs';

export interface BatchSelectionDetailProps {
  currentItem: BatchProductItem;
  focusedIndex: number;
  totalDisplayed: number;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  filteredTypedImgs: TypedProductImage[];
  selectedSet: Set<string>;
  galleryReady: boolean;
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  handleSelect: (url: string, isCurrentlySelected: boolean) => void;
  handlePreview: (imgIdx: number) => void;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  onConfirmAndNext?: () => void;
  canContinue?: boolean;
  handleBatchSelectFirst?: () => void;
  handleBatchSelectAllMain?: () => void;
}

const VIEW_MODE_STORAGE_KEY = 'workshop_gallery_view_mode';
const GRID_DENSITY_STORAGE_KEY = 'workshop_gallery_grid_density';

export const BatchSelectionDetail: React.FC<BatchSelectionDetailProps> = ({
  currentItem,
  focusedIndex,
  totalDisplayed,
  activeImgFilter,
  onFilterChange,
  filteredTypedImgs,
  selectedSet,
  galleryReady,
  setItems,
  batchSetProductImages,
  handleRemoveItem,
  handleSelect,
  handlePreview,
  setFocusedIndex,
  onConfirmAndNext,
  canContinue = false,
}) => {
  // 画廊呈现模式：默认主详分区 (sectioned)，支持瀑布流 (masonry) 与平铺网格 (grid)
  const [viewMode, setViewMode] = useState<GalleryViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'masonry' || saved === 'sectioned' || saved === 'grid') return saved;
    } catch {
      // ignore
    }
    return 'sectioned';
  });

  // 网格密度：大图 / 标准 / 紧凑
  const [gridDensity, setGridDensity] = useState<GridDensity>(() => {
    try {
      const saved = localStorage.getItem(GRID_DENSITY_STORAGE_KEY);
      if (saved === 'large' || saved === 'standard' || saved === 'compact') return saved;
    } catch {
      // ignore
    }
    return 'standard';
  });

  const handleViewModeChange = (mode: GalleryViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const handleGridDensityChange = (density: GridDensity) => {
    setGridDensity(density);
    try {
      localStorage.setItem(GRID_DENSITY_STORAGE_KEY, density);
    } catch {
      // ignore
    }
  };

  // 一键设为主基准
  const handleSetPrimary = useCallback((url: string) => {
    setItems(prev => setPrimaryProductImage(prev, currentItem.id, url));
  }, [setItems, currentItem.id]);

  const selectedCount = currentItem.selectedProductImages.length;

  // 智能解析当前商品的具体款式颜色与规格配置
  const skuInfo = useMemo(() => extractProductSkuInfo(currentItem), [currentItem]);

  // 构建已选参考胶卷列表（带类型与序号）
  const selectedTypedImages = useMemo<SelectedImageItem[]>(() => {
    const urlMap = new Map(currentItem.allTypedImages.map(img => [img.url, img]));
    return currentItem.selectedProductImages.map((url, idx) => ({
      url,
      type: urlMap.get(url)?.type ?? 'detail',
      order: idx + 1,
      isPrimary: idx === 0,
    }));
  }, [currentItem.selectedProductImages, currentItem.allTypedImages]);

  // 从胶卷中点击查看大图
  const handlePreviewByUrl = useCallback((url: string) => {
    const idx = filteredTypedImgs.findIndex(img => img.url === url);
    if (idx !== -1) {
      handlePreview(idx);
    } else {
      const allIdx = currentItem.allTypedImages.findIndex(img => img.url === url);
      if (allIdx !== -1) {
        onFilterChange('all');
        setTimeout(() => handlePreview(allIdx), 50);
      }
    }
  }, [filteredTypedImgs, currentItem.allTypedImages, handlePreview, onFilterChange]);

  const platformBadgeColor = useMemo(() => {
    const p = currentItem.platform?.toLowerCase();
    if (p === 'jd') return 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-300';
    if (p === 'taobao') return 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-300';
    if (p === 'tmall') return 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300';
    if (p === '1688') return 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300';
  }, [currentItem.platform]);

  return (
    <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-4 lg:p-5 space-y-3 bg-white h-full overflow-hidden w-full dark:bg-[#18191c]">
      {/* 1. 顶部商品核心信息条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 shrink-0 dark:border-white/10">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono text-[10px] font-black shrink-0 shadow-2xs dark:bg-white dark:text-slate-950">
              NO.{focusedIndex + 1}/{totalDisplayed}
            </span>
            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider shrink-0 ${platformBadgeColor}`}>
              {currentItem.platform || '商品'}
            </span>
            <h4 className="text-sm sm:text-base font-black text-slate-900 truncate dark:text-slate-100" title={currentItem.title}>
              {currentItem.title}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
              SKU: {currentItem.itemId}
            </span>

            {/* 款式颜色高亮呈现：方便用户一眼确认该选哪款配色的图 */}
            {skuInfo.color && (
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5 shadow-2xs">
                <Palette className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>款式颜色:</span>
                <span className="text-amber-950 dark:text-amber-100 font-black">{skuInfo.color}</span>
              </span>
            )}

            {skuInfo.spec && (
              <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
                配置: {skuInfo.spec}
              </span>
            )}

            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
              类目: {currentItem.category}
            </span>
            <span className="text-slate-900 font-black text-xs dark:text-slate-100">
              ¥{currentItem.price}
            </span>
            <span className={`font-bold px-2 py-0.5 rounded-md border transition-colors ${
              selectedCount > 0
                ? 'text-indigo-600 bg-indigo-50 border-indigo-200/80 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30'
                : 'text-slate-400 bg-slate-100/60 border-slate-200 dark:bg-white/5 dark:border-white/10'
            }`}>
              已选 {selectedCount} 张生成参考
            </span>
          </div>
        </div>
      </div>

      {/* 2. 复合控制台：分类过滤 + 多维画廊方案切换 + 快捷批选 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-1 shrink-0">
        {/* 左侧：分类过滤 Tabs */}
        <ImageTypeFilterTabs
          images={currentItem.allTypedImages}
          activeFilter={activeImgFilter}
          onFilterChange={onFilterChange}
        />

        {/* 右侧：画廊视图切换 + 快捷批选工具 */}
        <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
          {/* 画廊展示模式切换组件 */}
          <GalleryViewModeControl
            viewMode={viewMode}
            gridDensity={gridDensity}
            onViewModeChange={handleViewModeChange}
            onGridDensityChange={handleGridDensityChange}
          />

          {/* 快捷批选胶囊 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => batchSetProductImages(currentItem.id, 'all_main')}
              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer dark:bg-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/30"
              title="一键选中所有商品主图"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">全选主图</span>
            </button>
            <button
              type="button"
              onClick={() => batchSetProductImages(currentItem.id, 'first')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
              title="仅选择第 1 张主图作为参考"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">仅选首图</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. 核心画廊展示区（自适应主详分区与长图瀑布） */}
      <div
        key={`${currentItem.id}-${activeImgFilter}`}
        className="flex-1 min-h-0 py-1 overflow-y-auto pr-1 select-none"
      >
        <BatchProductImageGrid
          itemId={currentItem.id}
          images={filteredTypedImgs}
          selectedSet={selectedSet}
          selectedImages={currentItem.selectedProductImages}
          viewMode={viewMode}
          gridDensity={gridDensity}
          targetSkuColor={skuInfo.color}
          resetKey={`${currentItem.id}-${activeImgFilter}`}
          showSkeleton={!galleryReady}
          onSelect={handleSelect}
          onSetPrimary={handleSetPrimary}
          onPreview={handlePreview}
        />
      </div>

      {/* 4. 底部已选参考胶卷坞（0 张时隐去，不占空间） */}
      <BatchSelectedFilmstrip
        selectedTypedImages={selectedTypedImages}
        selectedCount={selectedCount}
        onPreviewByUrl={handlePreviewByUrl}
        onToggleSelect={(url) => handleSelect(url, true)}
        onSetPrimary={handleSetPrimary}
        onSelectAllMain={() => batchSetProductImages(currentItem.id, 'all_main')}
        onClear={() => batchSetProductImages(currentItem.id, 'clear')}
      />

      {/* 5. 底部流转与操作栏：放弃按钮放置在下一款/确认按钮左侧，方便连贯操作 */}
      <div className="pt-2.5 flex items-center justify-between border-t border-slate-100 shrink-0 bg-white dark:border-white/10 dark:bg-[#18191c]">
        {/* 左侧：轻量化选图辅助信息 */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {selectedCount === 0 ? (
            <span className="hidden sm:inline">点击上方卡片选择参考图，首张将作为 AI 绘制的主基准</span>
          ) : (
            <span className="font-medium text-slate-600 dark:text-slate-300">
              已选定 <span className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedCount}</span> 张生成参考
            </span>
          )}
        </div>

        {/* 右侧：动作控制组（放弃按钮放在下一款左侧，消除远距离跨屏移动） */}
        <div className="flex items-center justify-end gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleRemoveItem(currentItem.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 cursor-pointer transition-colors dark:border-rose-900/50 dark:hover:bg-rose-950/30"
            title="放弃该商品，从本次批量队列移除"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>放弃该商品</span>
          </button>

          {focusedIndex < totalDisplayed - 1 && (
            <button
              type="button"
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? '请至少选择一张商品图，或放弃该商品' : '保存当前选图并切换下一款'}
              onClick={() => {
                if (selectedCount === 0) return;
                setFocusedIndex(prev => Math.min(totalDisplayed - 1, prev + 1));
              }}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs active:scale-98 disabled:opacity-40 disabled:hover:bg-slate-900 disabled:cursor-not-allowed dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <span>下一款 ({focusedIndex + 2}/{totalDisplayed})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          {canContinue && onConfirmAndNext && (
            <button
              type="button"
              disabled={!canContinue}
              title={canContinue ? '选图已齐，进入提示词步骤' : '请为每款商品选择商品图'}
              onClick={() => { if (canContinue) onConfirmAndNext(); }}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-indigo-600/20"
            >
              <span>确认选图，进入下一步</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchSelectionDetail;
