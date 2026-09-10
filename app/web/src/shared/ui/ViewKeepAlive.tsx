import { useEffect, useState, type ReactNode } from 'react';
import type { AppView } from '@/store/view';

const KEEP_ALIVE_VIEWS: AppView[] = ['home', 'generate', 'assets'];

interface ViewKeepAlivePanelProps {
  view: AppView;
  currentView: AppView;
  children: ReactNode;
}

/** 缓存已访问视图 DOM，切换时隐藏而非卸载，减少重复加载 */
export function ViewKeepAlivePanel({ view, currentView, children }: ViewKeepAlivePanelProps) {
  const active = view === currentView;
  const [hasRendered, setHasRendered] = useState(active);

  useEffect(() => {
    if (active) {
      setHasRendered(true);
    }
  }, [active]);

  if (!KEEP_ALIVE_VIEWS.includes(view)) {
    return active ? <>{children}</> : null;
  }

  // 既不是当前激活的视图，且此前从未渲染过，则惰性跳过，不创建多余 DOM
  if (!active && !hasRendered) return null;

  return (
    <div
      className={active ? 'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden' : 'hidden'}
      aria-hidden={!active}
      data-view-panel={view}
    >
      {children}
    </div>
  );
}
