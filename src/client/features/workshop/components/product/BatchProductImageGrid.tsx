import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Palette, Star } from 'lucide-react';
import BatchProductImageTile from './BatchProductImageTile';
import type { TypedProductImage } from '../../model/batchTypes';

export type GalleryViewMode = 'masonry' | 'sectioned' | 'grid';
export type GridDensity = 'large' | 'standard' | 'compact';

const INITIAL_VISIBLE = 40;
const LOAD_MORE_STEP = 24;

interface Props {
  itemId: string;
  images: TypedProductImage[];
  selectedSet: Set<string>;
  selectedImages?: string[];
  viewMode?: GalleryViewMode;
  gridDensity?: GridDensity;
  targetSkuColor?: string;
  resetKey: string;
  showSkeleton?: boolean;
  onSelect: (url: string, isCurrentlySelected: boolean) => void;
  onSetPrimary?: (url: string) => void;
  onPreview: (index: number) => void;
}

function BatchProductImageGrid({
  itemId,
  images,
  selectedSet,
  selectedImages = [],
  viewMode = 'sectioned',
  gridDensity = 'standard',
  targetSkuColor,
  resetKey,
  showSkeleton = false,
  onSelect,
  onSetPrimary,
  onPreview,
}: Props) {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE);
  }, [resetKey]);

  const visibleImages = images.slice(0, visibleLimit);
  const hasMore = visibleLimit < images.length;

  const handleLoadMore = useCallback(() => {
    setVisibleLimit((n) => Math.min(n + LOAD_MORE_STEP, images.length));
  }, [images.length]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) handleLoadMore();
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, handleLoadMore, visibleImages.length]);

  // 区分主图/SKU与商详图（供主详分区模式使用）
  const { mainAndSkuList, detailList } = useMemo(() => {
    const mainAndSku: { img: TypedProductImage; originalIndex: number }[] = [];
    const detail: { img: TypedProductImage; originalIndex: number }[] = [];

    images.forEach((img, idx) => {
      if (img.type === 'main' || img.type === 'sku') {
        mainAndSku.push({ img, originalIndex: idx });
      } else {
        detail.push({ img, originalIndex: idx });
      }
    });

    return { mainAndSkuList: mainAndSku, detailList: detail };
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
        该分类下暂无采集图片
      </div>
    );
  }

  // 骨架屏态
  if (showSkeleton) {
    return (
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
        {Array.from({ length: Math.min(12, images.length || 12) }).map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-slate-100 animate-pulse dark:bg-white/5" />
        ))}
      </div>
    );
  }

  // 模式 1：🗂️ 主详分区模式（结构化呈现主图展台与商详卖点流）
  if (viewMode === 'sectioned' && mainAndSkuList.length > 0 && detailList.length > 0) {
    return (
      <div className="space-y-6 pb-4">
        {/* 分区 A：核心商品主图与款式 */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-xs" />
              <h5 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>核心商品主图与款式规格</span>
                <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.2 rounded-md">
                  {mainAndSkuList.length}
                </span>
              </h5>
              {targetSkuColor && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Palette className="w-3 h-3 text-amber-500" />
                  <span>当前款式：{targetSkuColor}</span>
                </span>
              )}
            </div>
          </div>

          {/* 主图区：采用精致中网格齐整呈现 */}
          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3.5">
            {mainAndSkuList.map(({ img, originalIndex }) => {
              const isChecked = selectedSet.has(img.url);
              const selectedOrder = isChecked ? selectedImages.indexOf(img.url) : -1;
              return (
                <BatchProductImageTile
                  key={`${itemId}-${img.url}`}
                  itemId={itemId}
                  imgObj={img}
                  imgIdx={originalIndex}
                  isChecked={isChecked}
                  selectedOrder={selectedOrder}
                  layout="grid"
                  onToggle={() => onSelect(img.url, isChecked)}
                  onSetPrimary={onSetPrimary ? () => onSetPrimary(img.url) : undefined}
                  onPreview={() => onPreview(originalIndex)}
                />
              );
            })}
          </div>
        </section>

        {/* 分区 B：商详长图切片与核心卖点 */}
        <section className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
              <h5 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                <span>商详长图与核心卖点切片</span>
                <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.2 rounded-md">
                  {detailList.length}
                </span>
              </h5>
            </div>
          </div>

          {/* 详情切片瀑布流 */}
          <div className="columns-2 min-[480px]:columns-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7 gap-3 sm:gap-3.5 space-y-3 sm:space-y-3.5">
            {detailList.slice(0, visibleLimit).map(({ img, originalIndex }) => {
              const isChecked = selectedSet.has(img.url);
              const selectedOrder = isChecked ? selectedImages.indexOf(img.url) : -1;
              return (
                <div key={`${itemId}-${img.url}`} className="break-inside-avoid inline-block w-full">
                  <BatchProductImageTile
                    itemId={itemId}
                    imgObj={img}
                    imgIdx={originalIndex}
                    isChecked={isChecked}
                    selectedOrder={selectedOrder}
                    layout="masonry"
                    onToggle={() => onSelect(img.url, isChecked)}
                    onSetPrimary={onSetPrimary ? () => onSetPrimary(img.url) : undefined}
                    onPreview={() => onPreview(originalIndex)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {hasMore && (
          <div ref={loadMoreRef} className="py-2 text-center text-[11px] text-slate-400 font-mono">
            加载更多素材 ({visibleLimit}/{images.length})
          </div>
        )}
      </div>
    );
  }

  // 模式 2：🌊 纯净瀑布流模式（自然长宽比，消除黑边）
  if (viewMode === 'masonry') {
    return (
      <div className="space-y-3 pb-4">
        <div className="columns-2 min-[480px]:columns-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7 gap-3 sm:gap-3.5 space-y-3 sm:space-y-3.5">
          {visibleImages.map((imgObj, imgIdx) => {
            const isChecked = selectedSet.has(imgObj.url);
            const selectedOrder = isChecked ? selectedImages.indexOf(imgObj.url) : -1;

            return (
              <div key={`${itemId}-${imgObj.url}`} className="break-inside-avoid inline-block w-full">
                <BatchProductImageTile
                  itemId={itemId}
                  imgObj={imgObj}
                  imgIdx={imgIdx}
                  isChecked={isChecked}
                  selectedOrder={selectedOrder}
                  layout="masonry"
                  onToggle={() => onSelect(imgObj.url, isChecked)}
                  onSetPrimary={onSetPrimary ? () => onSetPrimary(imgObj.url) : undefined}
                  onPreview={() => onPreview(imgIdx)}
                />
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div ref={loadMoreRef} className="py-2 text-center text-[11px] text-slate-400 font-mono">
            加载更多素材 ({visibleLimit}/{images.length})
          </div>
        )}
      </div>
    );
  }

  // 模式 3：🔲 齐整平铺网格模式（带密度切换）
  const gridClass = gridDensity === 'large'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4'
    : gridDensity === 'compact'
      ? 'grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-9 gap-2 sm:gap-2.5'
      : 'grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-3.5';

  return (
    <div className="space-y-3 pb-4">
      <div className={gridClass}>
        {visibleImages.map((imgObj, imgIdx) => {
          const isChecked = selectedSet.has(imgObj.url);
          const selectedOrder = isChecked ? selectedImages.indexOf(imgObj.url) : -1;

          return (
            <BatchProductImageTile
              key={`${itemId}-${imgObj.url}`}
              itemId={itemId}
              imgObj={imgObj}
              imgIdx={imgIdx}
              isChecked={isChecked}
              selectedOrder={selectedOrder}
              layout="grid"
              onToggle={() => onSelect(imgObj.url, isChecked)}
              onSetPrimary={onSetPrimary ? () => onSetPrimary(imgObj.url) : undefined}
              onPreview={() => onPreview(imgIdx)}
            />
          );
        })}
      </div>

      {hasMore && (
        <div ref={loadMoreRef} className="py-2 text-center text-[11px] text-slate-400 font-mono">
          加载更多素材 ({visibleLimit}/{images.length})
        </div>
      )}
    </div>
  );
}

export default React.memo(BatchProductImageGrid);
