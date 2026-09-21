import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BatchProductItem } from '../batchTypes';
import { BatchSelectionDetail } from './BatchSelectionDetail';
import { toggleProductImageSelection } from '../batchImageSelection';

interface Props {
  displayedItems: BatchProductItem[];
  focusedIndex: number;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  productFilter: 'all' | 'pending' | 'completed';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  onProductFilterChange: (f: 'all' | 'pending' | 'completed') => void;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onPreviewImage?: (url: string) => void;
  onConfirmAndNext: () => void;
  pendingItems: BatchProductItem[];
  completedItems: BatchProductItem[];
}

export default function BatchImageSelectionPanel({
  displayedItems,
  focusedIndex,
  activeImgFilter,
  onFilterChange,
  setFocusedIndex,
  setItems,
  batchSetProductImages,
  handleRemoveItem,
  onPreviewGallery,
  onPreviewImage,
  onConfirmAndNext,
  pendingItems,
  completedItems,
  onProductFilterChange,
}: Props) {
  const [galleryReady, setGalleryReady] = useState(true);

  const currentItem = displayedItems[focusedIndex] || displayedItems[0];

  useEffect(() => {
    setGalleryReady(false);
    const timer = window.setTimeout(() => setGalleryReady(true), 50);
    return () => window.clearTimeout(timer);
  }, [currentItem?.id, activeImgFilter]);

  // 统计
  const canContinue = completedItems.length > 0 && pendingItems.length === 0;

  // 当前商品的图片过滤
  const filteredTypedImgs = useMemo(
    () => activeImgFilter === 'all'
      ? (currentItem?.allTypedImages ?? [])
      : (currentItem?.allTypedImages.filter(t => t.type === activeImgFilter) ?? []),
    [currentItem, activeImgFilter],
  );

  const allUrls = useMemo(() => filteredTypedImgs.map(t => t.url), [filteredTypedImgs]);

  const selectedSet = useMemo(
    () => new Set(currentItem?.selectedProductImages ?? []),
    [currentItem],
  );

  // 全局批量快捷
  const handleBatchSelectAllMain = useCallback(() => {
    setItems(prev => prev.map(p => {
      const mains = p.allTypedImages.filter(t => t.type === 'main').map(t => t.url);
      const chosen = mains.length > 0 ? mains : (p.allTypedImages.slice(0, 1).map(t => t.url));
      return chosen.length > 0 ? { ...p, selectedProductImages: chosen, coverImage: chosen[0] } : p;
    }));
  }, [setItems]);

  const handleBatchSelectFirst = useCallback(() => {
    setItems(prev => prev.map(p => {
      const first = p.allTypedImages[0]?.url || p.coverImage;
      return first ? { ...p, selectedProductImages: [first], coverImage: first } : p;
    }));
  }, [setItems]);

  // 当前商品选图
  const handleSelect = useCallback((url: string) => {
    if (!currentItem) return;
    setItems(prev => toggleProductImageSelection(prev, currentItem.id, url));
  }, [currentItem, setItems]);

  const handlePreview = useCallback((imgIdx: number) => {
    if (onPreviewGallery && allUrls.length > 0) {
      onPreviewGallery(allUrls, imgIdx, currentItem?.title);
    } else if (onPreviewImage && filteredTypedImgs[imgIdx]?.url) {
      onPreviewImage(filteredTypedImgs[imgIdx].url);
    }
  }, [allUrls, currentItem, filteredTypedImgs, onPreviewGallery, onPreviewImage]);

  if (!currentItem || displayedItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-slate-400">
        暂无商品，请返回批量采编添加商品
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/70 shadow-[0_8px_30px_-6px_rgba(15,23,42,0.06)] overflow-hidden h-[calc(100vh-175px)] min-h-[520px] max-h-[960px] flex flex-col transition-all duration-300">
      {/* ===== 纯净独占全宽：当前商品选图大画幅核心区 ===== */}
      <BatchSelectionDetail
        currentItem={currentItem}
        focusedIndex={focusedIndex}
        totalDisplayed={displayedItems.length}
        activeImgFilter={activeImgFilter}
        onFilterChange={onFilterChange}
        filteredTypedImgs={filteredTypedImgs}
        selectedSet={selectedSet}
        galleryReady={galleryReady}
        setItems={setItems}
        batchSetProductImages={batchSetProductImages}
        handleRemoveItem={handleRemoveItem}
        handleSelect={handleSelect}
        handlePreview={handlePreview}
        setFocusedIndex={setFocusedIndex}
        onConfirmAndNext={onConfirmAndNext}
        canContinue={canContinue}
        handleBatchSelectFirst={handleBatchSelectFirst}
        handleBatchSelectAllMain={handleBatchSelectAllMain}
      />
    </div>
  );
}
