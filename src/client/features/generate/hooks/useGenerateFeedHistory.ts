import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { FlatBatchItem } from '../model/generateWorkspaceLayout';

export function useGenerateFeedHistory(
  flatBatches: FlatBatchItem[],
  sessionId: string,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
) {
  const [visibleBatchLimit, setVisibleBatchLimit] = useState(50);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const historyPositionRef = useRef<{ sessionId: string; top: number; height: number } | null>(null);
  const latestTaskId = flatBatches.at(-1)?.batch.tasks[0]?.id;
  const hasMoreBatches = visibleBatchLimit < flatBatches.length;

  useEffect(() => {
    setVisibleBatchLimit(50);
  }, [sessionId]);

  // Changing the conversation or adding a new latest task moves to its result; prepending history does not.
  useLayoutEffect(() => {
    historyPositionRef.current = null;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [sessionId, latestTaskId, scrollContainerRef]);

  useLayoutEffect(() => {
    const position = historyPositionRef.current;
    const container = scrollContainerRef.current;
    if (position?.sessionId === sessionId && container) {
      container.scrollTop = position.top + container.scrollHeight - position.height;
    }
    historyPositionRef.current = null;
  }, [visibleBatchLimit, sessionId, scrollContainerRef]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !hasMoreBatches) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || historyPositionRef.current) return;
      historyPositionRef.current = { sessionId, top: container.scrollTop, height: container.scrollHeight };
      setVisibleBatchLimit((limit) => Math.min(limit + 25, flatBatches.length));
    }, { root: container, rootMargin: '400px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [flatBatches.length, hasMoreBatches, sessionId, scrollContainerRef, visibleBatchLimit]);

  return {
    visibleFlatBatches: flatBatches.slice(Math.max(0, flatBatches.length - visibleBatchLimit)),
    hasMoreBatches,
    loadMoreSentinelRef,
  };
}
