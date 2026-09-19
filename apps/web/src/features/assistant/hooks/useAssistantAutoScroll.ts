import { useLayoutEffect, useRef } from 'react';

/** 打开/切换会话定位最新消息；阅读历史时停止自动跟随。 */
export function useAssistantAutoScroll(isOpen: boolean, sessionId: string, content: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const previous = useRef({ isOpen: false, sessionId: '' });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const entering = isOpen && (!previous.current.isOpen || previous.current.sessionId !== sessionId);
    previous.current = { isOpen, sessionId };
    if (!element || !isOpen) return;
    if (entering) following.current = true;
    const scrollToLatest = () => {
      if (following.current) element.scrollTop = element.scrollHeight;
    };
    scrollToLatest();
    // 等待抽屉布局、图片和流式内容撑开高度后继续贴底。
    const frame = requestAnimationFrame(scrollToLatest);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scrollToLatest);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    element.addEventListener('load', scrollToLatest, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      element.removeEventListener('load', scrollToLatest, true);
    };
  }, [isOpen, sessionId, content]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (element) following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
  };
  return { scrollRef, onScroll };
}
