import { useLayoutEffect, useRef } from 'react';

/** 打开/切换会话定位最新消息；只有用户主动上翻才停止跟随。 */
export function useAssistantAutoScroll(isOpen: boolean, sessionId: string, content: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const pinned = useRef(true);
  const touchY = useRef(0);
  const previous = useRef({ isOpen: false, sessionId: '' });

  const releaseFollow = () => {
    pinned.current = false;
    following.current = false;
  };

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const entering = isOpen && (!previous.current.isOpen || previous.current.sessionId !== sessionId);
    previous.current = { isOpen, sessionId };
    if (!element || !isOpen) return;
    if (entering) {
      pinned.current = true;
      following.current = true;
    }
    const scrollToLatest = () => {
      if (!following.current) return;
      if (Array.isArray(content) && content.length === 0) {
        element.scrollTop = 0;
        return;
      }
      element.scrollTop = element.scrollHeight;
    };
    const leave = () => {
      pinned.current = false;
      following.current = false;
    };
    const allowFollow = () => {
      pinned.current = false;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) leave();
      else if (event.deltaY > 0) allowFollow();
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY.current = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY.current;
      if (y > touchY.current + 12) leave();
      else if (y < touchY.current - 12) allowFollow();
      touchY.current = y;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') leave();
      else if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'End') allowFollow();
    };
    scrollToLatest();
    // 等待抽屉布局、图片和流式内容撑开高度后继续贴底。布局产生的 scroll 不取消跟随。
    const frame = requestAnimationFrame(scrollToLatest);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scrollToLatest);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    element.addEventListener('load', scrollToLatest, true);
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      element.removeEventListener('load', scrollToLatest, true);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, sessionId, content]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element || pinned.current) return;
    following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
  };
  return { scrollRef, onScroll, releaseFollow };
}
