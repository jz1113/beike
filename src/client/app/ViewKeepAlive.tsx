import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppView } from '@client/store/appView';
import { ViewVisibilityContext } from '@client/shared/hooks/useViewVisibility';

const KEEP_ALIVE_VIEWS: AppView[] = ['home', 'generate', 'keyword_review', 'headline_poster', 'assets', 'canvas', 'workshop'];

interface ViewKeepAlivePanelProps {
  view: AppView;
  currentView: AppView;
  children: ReactNode;
}

/** 缓存已访问视图 DOM，切换时隐藏而非卸载；隐藏期间冻结 children，避免父级重绘。 */
export function ViewKeepAlivePanel({ view, currentView, children }: ViewKeepAlivePanelProps) {
  const active = view === currentView;
  const [hasRendered, setHasRendered] = useState(active);
  const frozenChildren = useRef(children);
  if (active) frozenChildren.current = children;

  useEffect(() => {
    if (active) setHasRendered(true);
  }, [active]);

  if (!KEEP_ALIVE_VIEWS.includes(view)) {
    return active ? <ViewVisibilityContext.Provider value={active}>{children}</ViewVisibilityContext.Provider> : null;
  }

  if (!active && !hasRendered) return null;

  return (
    <ViewVisibilityContext.Provider value={active}>
      <div
        className={active ? 'flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden' : 'hidden'}
        aria-hidden={!active}
        inert={!active}
        data-view-panel={view}
      >
        {active ? children : frozenChildren.current}
      </div>
    </ViewVisibilityContext.Provider>
  );
}
