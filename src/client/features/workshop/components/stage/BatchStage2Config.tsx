import { useCallback, type Dispatch, type SetStateAction } from 'react';
import BatchImageSelectionPanel from '../product/BatchImageSelectionPanel';
import BatchStageFooter from './BatchStageFooter';
import type { BatchProductItem } from '../../model/batchTypes';

interface Props {
  focusedId: string;
  onFocus: (id: string) => void;
  successfulItems: BatchProductItem[];
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  setActiveImgFilter: (filter: 'all' | 'main' | 'sku' | 'detail') => void;
  toggleProductImageSelection: (itemId: string, imageUrl: string) => void;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onPreviewImage?: (url: string) => void;
  onNextStage: () => void;
  busy: boolean;
}

export default function BatchStage2Config(config: Props) {
  const { successfulItems, busy } = config;
  const { focusedId, onFocus } = config;
  const completedItems = successfulItems.filter(item => item.selectedProductImages.some(url => url.trim()));
  const pendingItems = successfulItems.filter(item => !item.selectedProductImages.some(url => url.trim()));
  const displayedItems = successfulItems;
  const currentFocusedIndex = displayedItems.findIndex(item => item.id === focusedId);
  const focusedIndex = Math.max(0, currentFocusedIndex);

  const setFocusedIndex = (action: number | ((previous: number) => number)) => {
    const index = typeof action === 'function' ? action(focusedIndex) : action;
    onFocus(displayedItems[index]?.id || '');
  };
  const handleDiscardItem = useCallback((itemId: string) => {
    const index = displayedItems.findIndex(item => item.id === itemId);
    const nextItem = displayedItems[index + 1] || displayedItems[index - 1];
    onFocus(nextItem?.id || '');
    config.handleRemoveItem(itemId);
  }, [config, displayedItems, onFocus]);
  const allImagesReady = successfulItems.length > 0 && pendingItems.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">为每条图文选图</h1>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">每条至少选一张。第一张用于确认商品外观，其余图片补充细节。</p></div>
        <span className="text-xs text-slate-500 dark:text-slate-400">已选图 <b className="text-indigo-600 dark:text-indigo-300">{completedItems.length}/{successfulItems.length}</b> 条</span>
      </div>
      {pendingItems.length > 0 && successfulItems.length > 1 && <button type="button" onClick={() => onFocus(pendingItems[0].id)}
        className="self-start rounded-md text-xs underline">定位首条待选</button>}
      <div className="flex min-h-[min(540px,65dvh)] flex-1">
        <BatchImageSelectionPanel displayedItems={displayedItems} focusedIndex={focusedIndex}
          activeImgFilter={config.activeImgFilter} onFilterChange={config.setActiveImgFilter}
          setFocusedIndex={setFocusedIndex} setItems={config.setItems} onToggleImage={config.toggleProductImageSelection}
          batchSetProductImages={config.batchSetProductImages} handleRemoveItem={handleDiscardItem}
          onPreviewGallery={config.onPreviewGallery} onPreviewImage={config.onPreviewImage} />
      </div>
      <BatchStageFooter
        hint={pendingItems.length > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">还有 {pendingItems.length} 条未选图</span>}
        primaryAction={{ label: '进入配图方案', onClick: config.onNextStage, disabled: busy || !allImagesReady }} />
    </section>
  );
}
