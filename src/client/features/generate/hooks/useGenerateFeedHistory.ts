import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import type { FlatBatchItem } from '../model/generateWorkspaceLayout';

const NEAR_BOTTOM = 64;

/** 贴住最新内容。面板隐藏或用户上翻时不改位置；向前补历史时保持当前视口。 */
export function useGenerateFeedHistory(
  flatBatches: FlatBatchItem[],
  sessionId: string,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
) {
  const visible = useViewVisibility();
  const [visibleBatchLimit, setVisibleBatchLimit] = useState(50);
  const [followReady, setFollowReady] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const historyPositionRef = useRef<{ sessionId: string; top: number; height: number } | null>(null);
  const following = useRef(true);
  const ownScroll = useRef(false);
  const touchY = useRef(0);
  const previous = useRef({ visible: false, sessionId: '', latestTaskId: '' });
  const latestTaskId = flatBatches.at(-1)?.batch.tasks[0]?.id ?? '';
  const hasMoreBatches = visibleBatchLimit < flatBatches.length;

  const pinToLatest = () => {
    const container = scrollContainerRef.current;
    following.current = true;
    if (!container || !visible) return;
    const top = container.scrollHeight;
    if (container.scrollTop >= top - 1) return;
    ownScroll.current = true;
    container.scrollTop = top;
    requestAnimationFrame(() => {
      ownScroll.current = false;
    });
  };

  useEffect(() => {
    setVisibleBatchLimit(50);
  }, [sessionId]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const entering = visible && (
      !previous.current.visible
      || previous.current.sessionId !== sessionId
      || previous.current.latestTaskId !== latestTaskId
    );
    previous.current = { visible, sessionId, latestTaskId };
    if (!container || !visible) {
      setFollowReady(false);
      return undefined;
    }
    if (entering) {
      following.current = true;
      historyPositionRef.current = null;
    }

    const lastTop = { current: container.scrollTop };
    const scrollToLatest = () => {
      if (!following.current || historyPositionRef.current) return;
      const top = container.scrollHeight;
      if (container.scrollTop >= top - 1) return;
      ownScroll.current = true;
      container.scrollTop = top;
      lastTop.current = container.scrollTop;
      requestAnimationFrame(() => {
        ownScroll.current = false;
      });
    };
    const releaseFollow = () => {
      following.current = false;
    };
    const onScroll = () => {
      const top = container.scrollTop;
      const movedUp = top + 1 < lastTop.current;
      lastTop.current = top;
      if (ownScroll.current || !movedUp) return;
      releaseFollow();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) releaseFollow();
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY.current = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY.current;
      if (y > touchY.current + 12) releaseFollow();
      touchY.current = y;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') releaseFollow();
    };

    scrollToLatest();
    const frame = requestAnimationFrame(() => {
      scrollToLatest();
      setFollowReady(true);
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scrollToLatest);
    observer?.observe(container);
    for (const child of container.children) observer?.observe(child);
    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('load', scrollToLatest, true);
    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('load', scrollToLatest, true);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [visible, sessionId, latestTaskId, scrollContainerRef]);

  useLayoutEffect(() => {
    const position = historyPositionRef.current;
    const container = scrollContainerRef.current;
    if (position?.sessionId === sessionId && container) {
      ownScroll.current = true;
      container.scrollTop = position.top + container.scrollHeight - position.height;
      requestAnimationFrame(() => {
        ownScroll.current = false;
      });
    }
    historyPositionRef.current = null;
  }, [visibleBatchLimit, sessionId, scrollContainerRef]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!visible || !followReady || !sentinel || !container || !hasMoreBatches) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || historyPositionRef.current) return;
      const canScroll = container.scrollHeight - container.clientHeight > NEAR_BOTTOM;
      if (following.current && canScroll) return;
      historyPositionRef.current = { sessionId, top: container.scrollTop, height: container.scrollHeight };
      setVisibleBatchLimit((limit) => Math.min(limit + 25, flatBatches.length));
    }, { root: container, rootMargin: '400px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [flatBatches.length, followReady, hasMoreBatches, sessionId, scrollContainerRef, visible, visibleBatchLimit]);

  return {
    visibleFlatBatches: flatBatches.slice(Math.max(0, flatBatches.length - visibleBatchLimit)),
    hasMoreBatches,
    loadMoreSentinelRef,
    pinToLatest,
  };
}
