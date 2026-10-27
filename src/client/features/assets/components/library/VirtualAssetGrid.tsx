import { memo, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface Props<T extends { id: string }> {
  items: T[];
  scrollRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
  openItemId: string | null;
  minCardWidth?: number;
  renderItem: (item: T, index: number) => ReactNode;
}

const CachedCard = memo(function CachedCard<T extends { id: string }>({
  item,
  index,
  renderItem,
}: {
  item: T;
  index: number;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return <>{renderItem(item, index)}</>;
}, (prev, next) => prev.item === next.item && prev.index === next.index && prev.renderItem === next.renderItem) as <T extends { id: string }>(props: {
  item: T;
  index: number;
  renderItem: (item: T, index: number) => ReactNode;
}) => ReactElement;

/** Keep the full collection available for filtering while mounting only visible rows. */
export function VirtualAssetGrid<T extends { id: string }>({
  items, scrollRef, resetKey, openItemId, renderItem, minCardWidth = 260,
}: Props<T>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 520,
    overscan: 2,
    getItemKey: (index) => `${index}:${items[index * columns]?.id ?? index}`,
  });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const updateColumns = () => {
      const count = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColumns(Math.max(1, count));
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [columns, virtualizer]);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    virtualizer.scrollToOffset(0);
  }, [resetKey, scrollRef, virtualizer]);

  return (
    <div
      ref={gridRef}
      data-asset-grid
      className="relative grid gap-x-4"
      style={{ height: virtualizer.getTotalSize(), gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minCardWidth}px), 1fr))` }}
    >
      {virtualizer.getVirtualItems().map((row) => {
        const rowItems = items.slice(row.index * columns, (row.index + 1) * columns);
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className="absolute top-0 left-0 w-full grid items-start gap-4 pb-4"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
              zIndex: rowItems.some((item) => item.id === openItemId) ? 1 : undefined,
            }}
          >
            {rowItems.map((item, columnIndex) => (
              <CachedCard key={item.id} item={item} index={row.index * columns + columnIndex} renderItem={renderItem} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
