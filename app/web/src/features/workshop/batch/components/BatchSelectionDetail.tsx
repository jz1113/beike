import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { BatchProductItem, TypedProductImage } from '../batchTypes';
import BatchProductImageGrid from './BatchProductImageGrid';
import ImageTypeFilterTabs from './ImageTypeFilterTabs';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';

export interface BatchSelectionDetailProps {
  currentItem: BatchProductItem;
  focusedIndex: number;
  totalDisplayed: number;
  displayedItems?: BatchProductItem[];
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  onFilterChange: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  filteredTypedImgs: TypedProductImage[];
  selectedSet: Set<string>;
  galleryReady: boolean;
  batchMode: 'original' | 'replication';
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  toggleReferenceImageSelection: (itemId: string, imgUrl: string) => void;
  handleSelect: (url: string, isCurrentlySelected: boolean) => void;
  handlePreview: (imgIdx: number) => void;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  onConfirmAndNext?: () => void;
  canContinue?: boolean;
  pendingCount?: number;
  onGoToPending?: () => void;
  handleBatchSelectFirst?: () => void;
  handleBatchSelectAllMain?: () => void;
}

export const BatchSelectionDetail: React.FC<BatchSelectionDetailProps> = ({
  currentItem,
  focusedIndex,
  totalDisplayed,
  displayedItems = [],
  activeImgFilter,
  onFilterChange,
  filteredTypedImgs,
  selectedSet,
  galleryReady,
  batchMode,
  handleRemoveItem,
  toggleReferenceImageSelection,
  handleSelect,
  handlePreview,
  setFocusedIndex,
  onConfirmAndNext,
  canContinue = false,
  pendingCount = 0,
  onGoToPending,
}) => {
  return (
    <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-5 lg:p-6 space-y-3 bg-white h-full overflow-hidden w-full">
      {/* 顶部商品信息条（纯净极简大标题与属性，操作全部汇聚至底部） */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 shrink-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-mono text-[10px] font-black shrink-0 shadow-2xs">
              NO.{focusedIndex + 1}
            </span>
            <h4 className="text-sm sm:text-base font-black text-slate-900 truncate" title={currentItem.title}>
              {currentItem.title}
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold">
              SKU: {currentItem.itemId}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold">
              平台: {currentItem.platform?.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-700 font-semibold">
              类目: {currentItem.category}
            </span>
            <span className="text-slate-900 font-black text-xs">¥{currentItem.price}</span>
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

      {/* 爆款对标模式额外参考图 */}
      {batchMode === 'replication' && (
        <div className="pt-3 border-t border-slate-100 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              对标参考图 (已选 {currentItem.selectedReferenceImages.length})
            </span>
            <span className="text-[11px] text-slate-400">点击勾选参考画面构图</span>
          </div>
          {currentItem.availableReferenceImages.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {currentItem.availableReferenceImages.map(imgUrl => {
                const isChecked = currentItem.selectedReferenceImages.includes(imgUrl);
                return (
                  <div
                    key={`${currentItem.id}-ref-${imgUrl}`}
                    onClick={() => toggleReferenceImageSelection(currentItem.id, imgUrl)}
                    className={`aspect-square rounded-xl border cursor-pointer overflow-hidden relative transition-all ${
                      isChecked ? 'border-indigo-600 ring-2 ring-indigo-600/30' : 'border-slate-200 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <LazyProxyImage src={imgUrl} thumb={true} width={280} alt="" />
                    {isChecked && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-1">未提取到对标图片</p>
          )}
        </div>
      )}

      {/* 底部综合流转与选图控制台：始终常驻可视区，操作全部汇聚在下方 */}
      <div className="pt-2.5 flex flex-wrap items-center justify-start gap-x-4 gap-y-2.5 border-t border-slate-100 shrink-0 bg-white">
        {/* 左侧：上一款 + 直达切换 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={focusedIndex <= 0}
            onClick={() => setFocusedIndex(prev => Math.max(0, prev - 1))}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 transition-all border border-slate-200/60 shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>上一款</span>
          </button>

          {displayedItems.length > 1 ? (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200/80">
              <span className="text-[11px] text-slate-400 font-mono font-medium">切换:</span>
              <select
                value={focusedIndex}
                onChange={(e) => setFocusedIndex(Number(e.target.value))}
                className="text-xs font-mono font-bold text-slate-800 bg-transparent cursor-pointer focus:outline-none max-w-[140px] sm:max-w-[200px] truncate"
                title="点击快速直达任意商品"
              >
                {displayedItems.map((item, idx) => (
                  <option key={item.id} value={idx}>
                    NO.{idx + 1} {item.selectedProductImages.length > 0 ? '✓已选' : '待选'} - {item.title.slice(0, 14)}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-mono text-slate-400 font-bold">
                ({focusedIndex + 1}/{totalDisplayed})
              </span>
            </div>
          ) : (
            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200/60">
              {focusedIndex + 1} / {totalDisplayed}
            </span>
          )}
        </div>

        {/* 右侧：移除此商品 + 下一步流转 */}
        <div className="ml-auto flex items-center justify-end gap-1.5 flex-wrap">
          {!canContinue && pendingCount > 0 && onGoToPending && (
            <button type="button" onClick={onGoToPending}
              className="px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl cursor-pointer">
              还有 {pendingCount} 款待选，去补齐
            </button>
          )}

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
