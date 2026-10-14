import React, { useCallback, useEffect, useRef, useState } from 'react';
import BatchProductImageTile, { type ImageTileVariant } from './BatchProductImageTile';
import type { TypedProductImage } from '../../model/batchTypes';

const INITIAL_VISIBLE = 24;
const LOAD_MORE_STEP = 16;

interface Props {
  itemId: string;
  images: TypedProductImage[];
  selectedSet: Set<string>;
  variant: ImageTileVariant;
  resetKey: string;
  showSkeleton?: boolean;
  onSelect: (url: string, isCurrentlySelected: boolean) => void;
  onPreview: (index: number) => void;
}

function BatchProductImageGrid({
  itemId,
  images,
  selectedSet,
  variant,
  resetKey,
  showSkeleton = false,
  onSelect,
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

  if (images.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-400">
        该分类下暂无图片
      </div>
    );
  }

  const gridClass = variant === 'focus'
    ? 'grid grid-cols-2 min-[540px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 min-[1920px]:grid-cols-8 gap-3 sm:gap-4'
    : 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-3';

  if (showSkeleton) {
    return (
      <div className={gridClass}>
        {Array.from({ length: Math.min(8, images.length) }).map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={gridClass}>
        {visibleImages.map((imgObj, imgIdx) => (
          <BatchProductImageTile
            key={`${itemId}-${imgObj.url}`}
            itemId={itemId}
            imgObj={imgObj}
            imgIdx={imgIdx}
            isChecked={selectedSet.has(imgObj.url)}
            variant={variant}
            onToggle={() => onSelect(imgObj.url, selectedSet.has(imgObj.url))}
            onPreview={() => onPreview(imgIdx)}
          />
        ))}
      </div>
      {hasMore && (
        <div ref={loadMoreRef} className="py-2 text-center text-[11px] text-slate-400">
          加载更多图片 ({visibleLimit}/{images.length})
        </div>
      )}
    </div>
  );
}

export default React.memo(BatchProductImageGrid);
