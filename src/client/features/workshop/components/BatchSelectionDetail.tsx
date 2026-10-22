import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCheck,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { BatchProductItem, TypedProductImage } from '../model/batchTypes';
import BatchProductHeroStage from './product/BatchProductHeroStage';
import BatchProductImageGrid from './product/BatchProductImageGrid';
import ImageTypeFilterTabs from './ImageTypeFilterTabs';

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

export const BatchSelectionDetail: React.FC<BatchSelectionDetailProps> = ({
  currentItem,
  focusedIndex,
  totalDisplayed,
  activeImgFilter,
  onFilterChange,
  filteredTypedImgs,
  selectedSet,
  galleryReady,
  batchSetProductImages,
  handleRemoveItem,
  handleSelect,
  handlePreview,
  setFocusedIndex,
  onConfirmAndNext,
  canContinue = false,
}) => {
  // 当前在画廊主舞台检视的图片索引
  const [heroIndex, setHeroIndex] = useState(0);

  // 当切换商品或切换素材分类时，重置主舞台聚焦点
  useEffect(() => {
    setHeroIndex(0);
  }, [currentItem.id, activeImgFilter]);

  // 确保主舞台焦点在合法范围内
  useEffect(() => {
    if (heroIndex >= filteredTypedImgs.length && filteredTypedImgs.length > 0) {
      setHeroIndex(filteredTypedImgs.length - 1);
    }
  }, [filteredTypedImgs.length, heroIndex]);

  const currentHeroImage = filteredTypedImgs[heroIndex] || filteredTypedImgs[0];

  const handleNextHero = useCallback(() => {
    if (filteredTypedImgs.length <= 1) return;
    setHeroIndex(i => (i + 1) % filteredTypedImgs.length);
  }, [filteredTypedImgs.length]);

  const handlePrevHero = useCallback(() => {
    if (filteredTypedImgs.length <= 1) return;
    setHeroIndex(i => (i - 1 + filteredTypedImgs.length) % filteredTypedImgs.length);
  }, [filteredTypedImgs.length]);

  // 键盘快捷流转支持：左右箭头切换舞台大图，空格一键选定/取消
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextHero();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevHero();
      } else if (e.key === ' ' || e.code === 'Space') {
        if (currentHeroImage) {
          e.preventDefault();
          handleSelect(currentHeroImage.url, selectedSet.has(currentHeroImage.url));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNextHero, handlePrevHero, currentHeroImage, handleSelect, selectedSet]);

  // 点击已选胶卷中的图片跳转检视
  const handleSelectByUrl = useCallback((url: string) => {
    const idx = filteredTypedImgs.findIndex(img => img.url === url);
    if (idx !== -1) {
      setHeroIndex(idx);
    } else {
      onFilterChange('all');
      setTimeout(() => {
        const newIdx = currentItem.allTypedImages.findIndex(img => img.url === url);
        if (newIdx !== -1) setHeroIndex(newIdx);
      }, 0);
    }
  }, [filteredTypedImgs, currentItem.allTypedImages, onFilterChange]);

  const selectedCount = currentItem.selectedProductImages.length;

  return (
    <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-4 lg:p-5 space-y-3 bg-white h-full overflow-hidden w-full dark:bg-[#18191c]">
      {/* 顶部商品信息条（纯净极简大标题与核心属性） */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 shrink-0 dark:border-white/10">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono text-[10px] font-black shrink-0 shadow-2xs dark:bg-white dark:text-slate-950">
              NO.{focusedIndex + 1}
            </span>
            <h4 className="text-sm sm:text-base font-black text-slate-900 truncate dark:text-slate-100" title={currentItem.title}>
              {currentItem.title}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
              SKU: {currentItem.itemId}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
              平台: {currentItem.platform?.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold dark:text-slate-200 dark:bg-white/5 dark:border-white/10">
              类目: {currentItem.category}
            </span>
            <span className="text-slate-900 font-black text-xs dark:text-slate-100">¥{currentItem.price}</span>
            <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/80 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30">
              当前已选 {selectedCount} 张
            </span>
          </div>
        </div>
      </div>

      {/* 核心画廊交互区：左右双栏联动 */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 gap-3.5 lg:gap-4 overflow-hidden">
        {/* 左栏：主舞台大图焦点检视 + 已选参考缩略序列 */}
        <div className="w-full lg:w-[44%] xl:w-[42%] flex flex-col min-h-0 shrink-0">
          <BatchProductHeroStage
            currentImage={currentHeroImage}
            currentIndex={heroIndex}
            totalImages={filteredTypedImgs.length}
            selectedImages={currentItem.selectedProductImages}
            allTypedImages={currentItem.allTypedImages}
            onToggleSelect={(url) => handleSelect(url, selectedSet.has(url))}
            onPreview={handlePreview}
            onNext={handleNextHero}
            onPrev={handlePrevHero}
            onSelectByUrl={handleSelectByUrl}
          />
        </div>

        {/* 右栏：素材分类胶卷与全景网格素材库 */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 border-t lg:border-t-0 lg:border-l border-slate-100 pt-2 lg:pt-0 lg:pl-4 dark:border-white/10">
          {/* 分类过滤与快捷批选动作栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 shrink-0">
            <ImageTypeFilterTabs
              images={currentItem.allTypedImages}
              activeFilter={activeImgFilter}
              onFilterChange={onFilterChange}
            />

            {/* 极简快捷批选胶囊条 */}
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => batchSetProductImages(currentItem.id, 'all_main')}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer dark:bg-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/30"
                title="一键选中所有商品主图"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>全选主图</span>
              </button>
              <button
                type="button"
                onClick={() => batchSetProductImages(currentItem.id, 'first')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
                title="仅选择第1张主图作为参考"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>仅选首图</span>
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => batchSetProductImages(currentItem.id, 'clear')}
                  className="px-2 py-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                  title="清空当前商品的选图"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>清空</span>
                </button>
              )}
            </div>
          </div>

          {/* 素材网格胶卷池（纵向弹性滚动） */}
          <div
            key={`${currentItem.id}-${activeImgFilter}`}
            className="flex-1 min-h-0 py-1 overflow-y-auto pr-1"
          >
            <BatchProductImageGrid
              itemId={currentItem.id}
              images={filteredTypedImgs}
              selectedSet={selectedSet}
              selectedImages={currentItem.selectedProductImages}
              activeHeroIndex={heroIndex}
              variant="focus"
              resetKey={`${currentItem.id}-${activeImgFilter}`}
              showSkeleton={!galleryReady}
              onSelect={handleSelect}
              onPreview={handlePreview}
              onFocusStage={(idx) => setHeroIndex(idx)}
            />
          </div>
        </div>
      </div>

      {/* 底部综合流转与选图控制台：始终常驻可视区 */}
      <div className="pt-2.5 flex items-center justify-between border-t border-slate-100 shrink-0 bg-white dark:border-white/10 dark:bg-[#18191c]">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <button
            type="button"
            onClick={() => handleRemoveItem(currentItem.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 cursor-pointer transition-colors dark:border-rose-900/50 dark:hover:bg-rose-950/30"
            title="放弃该商品，从本次批量队列移除"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>放弃该商品</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 flex-wrap">
          {focusedIndex < totalDisplayed - 1 && (
            <button
              type="button"
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? '请至少选择一张商品图，或放弃该商品' : '保存当前选图并切换下一款'}
              onClick={() => {
                if (selectedCount === 0) return;
                setFocusedIndex(prev => Math.min(totalDisplayed - 1, prev + 1));
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs active:scale-98 disabled:opacity-40 disabled:hover:bg-slate-900 disabled:cursor-not-allowed dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
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
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-indigo-600/20"
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
