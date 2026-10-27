import React, { useCallback, useMemo } from 'react';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Palette,
  RotateCcw,
} from 'lucide-react';
import type { BatchProductItem, TypedProductImage } from '../../model/batchTypes';
import { applyInvalidationToItems } from '../../model/workspace/applyInvalidation';
import { setPrimaryProductImage } from '../../model/collection/batchImageSelection';
import { extractProductSkuInfo } from '../../model/collection/skuColorExtraction';
import BatchProductImageGrid from './BatchProductImageGrid';
import ImageTypeFilterTabs from '../delivery/ImageTypeFilterTabs';

export interface BatchSelectionDetailProps {
  currentItem: BatchProductItem;
  focusedIndex: number;
  totalDisplayed: number;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  filteredTypedImgs: TypedProductImage[];
  selectedSet: Set<string>;
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  handleSelect: (url: string, isCurrentlySelected: boolean) => void;
  handlePreview: (imgIdx: number) => void;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
}

export const BatchSelectionDetail: React.FC<BatchSelectionDetailProps> = ({
  currentItem,
  focusedIndex,
  totalDisplayed,
  activeImgFilter,
  onFilterChange,
  filteredTypedImgs,
  selectedSet,
  setItems,
  batchSetProductImages,
  handleRemoveItem,
  handleSelect,
  handlePreview,
  setFocusedIndex,
}) => {
  const handleSetPrimary = useCallback((url: string) => {
    if (currentItem.selectedProductImages[0] === url) return;
    setItems(prev => applyInvalidationToItems(setPrimaryProductImage(prev, currentItem.id, url), { type: 'product_images', productId: currentItem.id }));
  }, [setItems, currentItem.id, currentItem.selectedProductImages]);

  const selectedCount = currentItem.selectedProductImages.length;
  const skuInfo = useMemo(() => extractProductSkuInfo(currentItem), [currentItem]);
  const isLastProduct = focusedIndex >= totalDisplayed - 1;

  const platformBadgeColor = useMemo(() => {
    const p = currentItem.platform?.toLowerCase();
    if (p === 'jd') return 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-300';
    if (p === 'taobao') return 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-300';
    if (p === 'tmall') return 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300';
    if (p === '1688') return 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-300';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300';
  }, [currentItem.platform]);

  return (
    <div className="flex-1 flex flex-col min-w-0 p-4 sm:p-5 lg:p-6 space-y-3 bg-white h-full overflow-hidden w-full dark:bg-[#18191c]">
      {/* 1. 顶部商品核心信息 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 shrink-0 dark:border-white/10">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono text-[10px] font-black shrink-0 shadow-2xs dark:bg-white dark:text-slate-950">
              NO.{focusedIndex + 1}/{totalDisplayed}
            </span>
            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider shrink-0 ${platformBadgeColor}`}>
              {currentItem.platform || '商品'}
            </span>
            <h4 className="min-w-0 flex-1 text-sm sm:text-base font-black leading-6 text-slate-900 whitespace-pre-wrap break-words dark:text-slate-100" title={currentItem.title}>
              {currentItem.title}
            </h4>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
              SKU: {currentItem.itemId}
            </span>

            {skuInfo.color && (
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5 shadow-2xs">
                <Palette className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>款式颜色:</span>
                <span className="text-amber-950 dark:text-amber-100 font-black">{skuInfo.color}</span>
              </span>
            )}
          </div>
        </div>

      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          商品参考图
          <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">
            （共 {currentItem.allTypedImages.length} 张 · 已选 {selectedCount} 张）
          </span>
        </h3>
        <ImageTypeFilterTabs
          images={currentItem.allTypedImages}
          activeFilter={activeImgFilter}
          onFilterChange={onFilterChange}
          className="shrink-0"
        />
      </div>

      {/* 2. 核心画廊展示区（中图统一网格，独占全屏剩余高度） */}
      <div
        key={`${currentItem.id}-${activeImgFilter}`}
        className="flex-1 min-h-0 py-2 overflow-y-auto pr-1 select-none"
      >
        <BatchProductImageGrid
          itemId={currentItem.id}
          images={filteredTypedImgs}
          selectedSet={selectedSet}
          selectedImages={currentItem.selectedProductImages}
          resetKey={`${currentItem.id}-${activeImgFilter}`}
          onSelect={handleSelect}
          onSetPrimary={handleSetPrimary}
          onPreview={handlePreview}
        />
      </div>

      {/* 3. 底部流转与操作栏：末款才展示确认进入下一步，支持前后款切换 */}
      <div className="pt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 shrink-0 bg-white dark:border-white/10 dark:bg-[#18191c]">
        {/* 左侧：选图计数与清空 */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {selectedCount === 0 ? (
            <span className="hidden sm:inline">点击上方卡片选择商品图，首张将作为商品身份锚图</span>
          ) : (
            <>
              <span className="font-medium text-slate-600 dark:text-slate-300">
                已选 <span className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedCount}</span> 张商品图
              </span>
              <button
                type="button"
                onClick={() => batchSetProductImages(currentItem.id, 'clear')}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors cursor-pointer dark:hover:bg-white/10 dark:hover:text-rose-400"
                title="清空当前商品已选商品图"
              >
                <RotateCcw className="w-3 h-3" />
                <span>清空</span>
              </button>
            </>
          )}
        </div>

        {/* 右侧：动作控制组（未到末款时只显示下一款，末款才显示确认进入下一步） */}
        <div className="flex items-center justify-end gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleRemoveItem(currentItem.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 cursor-pointer transition-colors dark:border-rose-900/50 dark:hover:bg-rose-950/30"
            title="放弃商品，保留采集记录并跳过本次制作"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>放弃商品</span>
          </button>

          {focusedIndex > 0 && (
            <button
              type="button"
              onClick={() => setFocusedIndex(prev => Math.max(0, prev - 1))}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1 transition-all active:scale-98 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              title="返回上一款商品"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>上一款 ({focusedIndex}/{totalDisplayed})</span>
            </button>
          )}

          {!isLastProduct && <button type="button" onClick={() => setFocusedIndex(prev => Math.min(totalDisplayed - 1, prev + 1))}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
            下一款 <ChevronRight className="h-3.5 w-3.5" />
          </button>}

        </div>
      </div>
    </div>
  );
};

export default BatchSelectionDetail;
