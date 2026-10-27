import React, { useCallback, useEffect, useRef, useState } from 'react';
import BatchProductImageTile from './BatchProductImageTile';
import type { TypedProductImage } from '../../model/batchTypes';

const INITIAL_VISIBLE = 42;
const LOAD_MORE_STEP = 28;

interface Props {
  itemId: string;
  images: TypedProductImage[];
  selectedSet: Set<string>;
  selectedImages?: string[];
  resetKey: string;
  onSelect: (url: string, isCurrentlySelected: boolean) => void;
  onSetPrimary?: (url: string) => void;
  onPreview: (index: number) => void;
}

function BatchProductImageGrid({
  itemId,
  images,
  selectedSet,
  selectedImages = [],
  resetKey,
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

  if (images.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
        该分类下暂无采集图片
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3.5 sm:gap-4">
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
              onToggle={() => onSelect(imgObj.url, isChecked)}
              onSetPrimary={onSetPrimary ? () => onSetPrimary(imgObj.url) : undefined}
              onPreview={() => onPreview(imgIdx)}
            />
          );
        })}
      </div>

      {hasMore && (
        <div ref={loadMoreRef} className="py-2 text-center text-[11px] text-slate-400 font-mono">
          加载更多商品图 ({visibleLimit}/{images.length})
        </div>
      )}
    </div>
  );
}

export default React.memo(BatchProductImageGrid);
