import type { DragEvent, Ref } from 'react';
import { Images, PanelLeftOpen } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { eligibleSalesImages, SALES_IMAGE_VIEW_LABELS, type SalesImageRef } from '@shared/domain/sales';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { SALES_IMAGE_DRAG_TYPE, salesImageDragData } from '../model/salesImageDrag';
import { salesFocusClass } from './salesChrome';

/**
 * 折叠态左侧 56px 垂直缩略图迷你轨（Product Mini Rail）
 * 替代旧版挤占右侧顶部的横幅，消除布局上下跳动，且支持在折叠态下直接拖出参考图识字。
 */
export function SalesProductSelectionSummary({
  state,
  galleryId,
  onExpand,
  expandButtonRef,
  onImageDragging,
}: {
  state: SalesCollectionState;
  galleryId: string;
  onExpand: () => void;
  expandButtonRef: Ref<HTMLButtonElement>;
  onImageDragging?: (url: string | null) => void;
}) {
  const selected = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const previewItems = selected.length
    ? selected.slice(0, 6)
    : state.imageCatalog.filter((img) => !img.unavailable).slice(0, 4);

  const handleDragStart = (event: DragEvent<HTMLDivElement>, image: SalesImageRef) => {
    event.dataTransfer.setData(SALES_IMAGE_DRAG_TYPE, salesImageDragData(image));
    event.dataTransfer.effectAllowed = 'copy';
    onImageDragging?.(image.url);
  };

  return (
    <aside
      aria-label="当前商品与选图摘要"
      className="flex w-full shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/85 px-3 py-2 backdrop-blur-xl lg:h-full lg:w-[62px] lg:flex-col lg:justify-start lg:border-r lg:border-b-0 lg:px-1.5 lg:py-3 dark:border-white/[0.08] dark:bg-[#151515]/90"
    >
      <button
        ref={expandButtonRef}
        type="button"
        aria-expanded={false}
        aria-controls={galleryId}
        onClick={onExpand}
        title={`${state.productName || '展开商品素材仓'} · 已选 ${selected.length} 张 / 共 ${state.imageCatalog.length} 张`}
        className={`group flex h-10 w-auto items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-stone-400 hover:bg-stone-100 hover:text-stone-900 lg:w-11 lg:flex-col lg:justify-center lg:gap-0.5 lg:px-0 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-zinc-400/40 dark:hover:bg-white/10 dark:hover:text-zinc-100 ${salesFocusClass}`}
      >
        <PanelLeftOpen size={15} aria-hidden />
        <span className="lg:sr-only">展开选图</span>
      </button>

      {/* 已选数量胶囊 */}
      <div
        className="inline-flex items-center justify-center rounded-lg bg-stone-100 px-2 py-0.5 font-mono-nums text-[11px] font-bold text-stone-700 lg:w-11 lg:px-1 dark:bg-stone-1000/15 dark:text-zinc-200"
        title={`已选 ${selected.length} 张参考图 · 共 ${state.imageCatalog.length} 张商品图`}
      >
        {selected.length}/{state.imageCatalog.length}
      </div>

      {/* 垂直缩略图轨（支持直接拖出到右侧识字） */}
      <div className="flex items-center gap-1.5 overflow-x-auto lg:mt-1 lg:w-full lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
        {previewItems.length ? (
          previewItems.map((img) => {
            const viewLabel = img.view ? SALES_IMAGE_VIEW_LABELS[img.view] : `#${img.index + 1}`;
            return (
              <div
                key={img.url}
                draggable
                onDragStart={(e) => handleDragStart(e, img)}
                onDragEnd={() => onImageDragging?.(null)}
                onClick={onExpand}
                title={`商品图 #${img.index + 1}（${viewLabel}）· 可拖拽识字或点击展开`}
                className="group relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-slate-200/90 bg-slate-100 shadow-2xs transition hover:scale-105 hover:border-stone-400 lg:h-11 lg:w-11 dark:border-white/12 dark:bg-white/[0.06]"
              >
                <img
                  src={proxyMediaUrl(img.url, { thumb: true, width: 96 })}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-0.5 text-center text-[9px] font-semibold leading-tight text-white">
                  {viewLabel}
                </span>
              </div>
            );
          })
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 lg:h-11 lg:w-11 dark:border-white/15">
            <Images size={16} aria-hidden />
          </div>
        )}
      </div>
    </aside>
  );
}
