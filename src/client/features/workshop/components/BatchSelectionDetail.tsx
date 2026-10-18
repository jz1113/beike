import { ChevronRight, Trash2 } from 'lucide-react';
import type { BatchProductItem, TypedProductImage } from '../model/batchTypes';
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
  handleRemoveItem,
  handleSelect,
  handlePreview,
  setFocusedIndex,
  onConfirmAndNext,
  canContinue = false,
}) => {
  return (
    <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-5 lg:p-6 space-y-3 bg-white h-full overflow-hidden w-full dark:bg-[#18191c]">
      {/* 顶部商品信息条（纯净极简大标题与属性，操作全部汇聚至底部） */}
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
            <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/80">
              当前已选 {currentItem.selectedProductImages.length} 张
            </span>
          </div>
        </div>
      </div>

      {/* 素材分类过滤栏 */}
      <ImageTypeFilterTabs
        images={currentItem.allTypedImages}
        activeFilter={activeImgFilter}
        onFilterChange={onFilterChange}
        hint="可多选 · 首张选中图为主参考 · 再次点击取消 · 放大镜查看原图"
      />

      {/* 素材图片大图网格池（自适应视口弹性纵向滚动） */}
      <div
        key={`${currentItem.id}-${activeImgFilter}`}
        className="flex-1 min-h-0 py-1 overflow-y-auto pr-1"
      >
        <BatchProductImageGrid
          itemId={currentItem.id}
          images={filteredTypedImgs}
          selectedSet={selectedSet}
          variant="focus"
          resetKey={`${currentItem.id}-${activeImgFilter}`}
          showSkeleton={!galleryReady}
          onSelect={handleSelect}
          onPreview={handlePreview}
        />
      </div>

      {/* 底部综合流转与选图控制台：始终常驻可视区，操作全部汇聚在下方 */}
      <div className="pt-2.5 flex items-center justify-end border-t border-slate-100 shrink-0 bg-white dark:border-white/10 dark:bg-[#18191c]">
        {/* 仅保留实际会改变当前选图结果的操作，避免与商品进度信息重复。 */}
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {/* 下一步与完成按钮 */}
          {canContinue && onConfirmAndNext && (
            <button type="button" disabled={!canContinue}
              title={canContinue ? '选图已齐，进入提示词步骤' : '请为每款商品选择商品图；有对标素材时还需选择参考图'}
              onClick={() => { if (canContinue) onConfirmAndNext(); }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <span>确认选图，进入下一步</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {!canContinue && <button
            type="button"
            onClick={() => handleRemoveItem(currentItem.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap rounded-xl bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 cursor-pointer transition-colors"
            title="放弃该商品，从本次批量队列移除"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>放弃该商品</span>
          </button>}
          {!canContinue && focusedIndex < totalDisplayed - 1 ? (
            <button
              type="button"
              disabled={currentItem.selectedProductImages.length === 0}
              title={currentItem.selectedProductImages.length === 0 ? '请至少选择一张商品图，或放弃该商品' : '保存当前选图并切换下一款'}
              onClick={() => {
                if (currentItem.selectedProductImages.length === 0) return;
                setFocusedIndex(prev => Math.min(totalDisplayed - 1, prev + 1));
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all shadow-2xs border border-emerald-600 active:scale-98 disabled:opacity-40 disabled:hover:bg-emerald-600 disabled:cursor-not-allowed"
            >
              <span>下一款 ({focusedIndex + 2}/{totalDisplayed})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
