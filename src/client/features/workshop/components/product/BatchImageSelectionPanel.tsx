import React, { useCallback, useEffect, useMemo } from 'react';
import type { BatchProductItem } from '../../model/batchTypes';
import { BatchSelectionDetail } from './BatchSelectionDetail';
import { toggleProductImageSelection } from '../../model/collection/batchImageSelection';

interface Props {
  displayedItems: BatchProductItem[];
  focusedIndex: number;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  onToggleImage?: (itemId: string, imgUrl: string) => void;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onPreviewImage?: (url: string) => void;
}

export default function BatchImageSelectionPanel({
  displayedItems,
  focusedIndex,
  activeImgFilter,
  onFilterChange,
  setFocusedIndex,
  setItems,
  onToggleImage,
  batchSetProductImages,
  handleRemoveItem,
  onPreviewGallery,
  onPreviewImage,
}: Props) {
  const currentItem = displayedItems[focusedIndex] || displayedItems[0];

  useEffect(() => {
    if (!currentItem || activeImgFilter === 'all') return;
    const count = currentItem.allTypedImages.filter((image) => image.type === activeImgFilter).length;
    if (count === 0) onFilterChange('all');
  }, [currentItem, activeImgFilter, onFilterChange]);


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

  const handleSelect = useCallback((url: string) => {
    if (!currentItem) return;
    if (onToggleImage) onToggleImage(currentItem.id, url);
    else setItems(prev => toggleProductImageSelection(prev, currentItem.id, url));
  }, [currentItem, onToggleImage, setItems]);

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
        当前筛选下暂无商品，请切换左侧选图状态
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-200/70 shadow-[0_8px_30px_-6px_rgba(15,23,42,0.06)] overflow-hidden min-h-[620px] flex-1 flex flex-col transition-all duration-300 dark:border-white/10 dark:bg-[#18191c]/95">
      <BatchSelectionDetail
        currentItem={currentItem}
        focusedIndex={focusedIndex}
        totalDisplayed={displayedItems.length}
        activeImgFilter={activeImgFilter}
        onFilterChange={onFilterChange}
        filteredTypedImgs={filteredTypedImgs}
        selectedSet={selectedSet}
        setItems={setItems}
        batchSetProductImages={batchSetProductImages}
        handleRemoveItem={handleRemoveItem}
        handleSelect={handleSelect}
        handlePreview={handlePreview}
        setFocusedIndex={setFocusedIndex}
      />
    </div>
  );
}
