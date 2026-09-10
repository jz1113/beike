import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface Props<T extends { id: string }> {
  items: T[];
  scrollRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
  openItemId: string | null;
  renderItem: (item: T) => ReactNode;
}

/** Keep the full collection available for filtering while mounting only visible rows. */
export function VirtualAssetGrid<T extends { id: string }>({
  items, scrollRef, resetKey, openItemId, renderItem,
}: Props<T>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 300,
    overscan: 2,
    getItemKey: (index) => items[index * columns]?.id ?? index,
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
      className="relative grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => {
        const rowItems = items.slice(row.index * columns, (row.index + 1) * columns);
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className="absolute top-0 left-0 w-full grid gap-5 pb-5"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start}px)`,
              zIndex: rowItems.some((item) => item.id === openItemId) ? 1 : undefined,
            }}
          >
            {rowItems.map(renderItem)}
          </div>
        );
      })}
    </div>
  );
}
