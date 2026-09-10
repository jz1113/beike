import { useCallback, useEffect, useRef, useState } from 'react';

/** 主内容区宽度低于此值时进入 compact 布局 */
export const COMPACT_LAYOUT_MAX = 1200;

export type AppLayoutMode = 'compact' | 'comfortable';

export function applyAppLayoutMode(mode: AppLayoutMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.layout = mode;
}

export function useCompactLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < COMPACT_LAYOUT_MAX;
  });

  const updateLayout = useCallback((width: number) => {
    const compact = width < COMPACT_LAYOUT_MAX;
    setIsCompact(compact);
    applyAppLayoutMode(compact ? 'compact' : 'comfortable');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateLayout(entry.contentRect.width);
    });

    observer.observe(el);
    updateLayout(el.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [updateLayout]);

  return { ref, isCompact };
}

/** 订阅 html[data-layout] 变化（供弹窗、Composer 等子树使用） */
export function useAppLayoutMode(): AppLayoutMode {
  const [mode, setMode] = useState<AppLayoutMode>(() => {
    if (typeof document === 'undefined') return 'comfortable';
    return document.documentElement.dataset.layout === 'compact' ? 'compact' : 'comfortable';
  });

  useEffect(() => {
    const sync = () => {
      setMode(document.documentElement.dataset.layout === 'compact' ? 'compact' : 'comfortable');
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
    return () => observer.disconnect();
  }, []);

  return mode;
}
