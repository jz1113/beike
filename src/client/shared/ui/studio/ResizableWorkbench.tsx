import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

function readInitialWidth(storageKey: string | undefined, defaultWidth: number, minWidth: number, maxWidth: number): number {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return defaultWidth;
  try {
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= minWidth && saved <= maxWidth) return saved;
  } catch {
    // 忽略受限存储环境
  }
  return defaultWidth;
}

export interface ResizablePaneOptions {
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useResizablePane({
  storageKey,
  defaultWidth = 368,
  minWidth = 288,
  maxWidth = 520,
}: ResizablePaneOptions = {}) {
  const [width, setWidth] = useState<number>(readInitialWidth(storageKey, defaultWidth, minWidth, maxWidth));
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(storageKey, String(Math.round(width)));
    } catch {
      // 忽略受限存储环境
    }
  }, [storageKey, width]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const delta = event.clientX - dragStartRef.current.startX;
    setWidth(Math.min(maxWidth, Math.max(minWidth, dragStartRef.current.startWidth + delta)));
  };

  const onPointerUp = () => {
    dragStartRef.current = null;
    setDragging(false);
  };

  const resetWidth = () => setWidth(defaultWidth);

  return {
    width,
    dragging,
    style: { '--studio-sidebar-w': `${Math.round(width)}px` } as CSSProperties,
    handleProps: {
      dragging,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick: resetWidth,
    },
  };
}

export interface WorkbenchResizeHandleProps {
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
  hidden?: boolean;
}

export function WorkbenchResizeHandle({
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  hidden = false,
}: WorkbenchResizeHandleProps) {
  if (hidden) return null;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整面板宽度（双击恢复默认）"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      className="group relative hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center bg-slate-100/50 transition-colors hover:bg-indigo-50/70 lg:flex dark:bg-white/[0.02] dark:hover:bg-indigo-500/10"
    >
      <span
        className={`w-1 rounded-full transition-all duration-150 ${
          dragging
            ? 'h-24 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
            : 'h-12 bg-slate-300/80 group-hover:h-20 group-hover:bg-indigo-400 dark:bg-white/15 dark:group-hover:bg-indigo-400'
        }`}
      />
    </div>
  );
}

export interface ResizableWorkbenchProps extends ResizablePaneOptions {
  sidebar: ReactNode;
  stacked?: boolean;
  collapsedRail?: ReactNode;
  collapsed?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * 弹性可拖拽调宽工作台分栏器（Resizable Workbench）
 */
export function ResizableWorkbench({
  sidebar,
  stacked = false,
  collapsedRail,
  collapsed = false,
  children,
  storageKey,
  defaultWidth = 320,
  minWidth = 240,
  maxWidth = 480,
  className = '',
}: ResizableWorkbenchProps) {
  const pane = useResizablePane({ storageKey, defaultWidth, minWidth, maxWidth });

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${stacked ? '' : 'lg:flex-row'} ${pane.dragging ? 'select-none' : ''} ${className}`.trim()}>
      {collapsed ? (
        collapsedRail ? <div className="shrink-0">{collapsedRail}</div> : null
      ) : (
        <>
          <div style={stacked ? undefined : pane.style} className={`flex min-h-0 w-full shrink-0 flex-col ${stacked ? '' : 'lg:w-[var(--studio-sidebar-w)]'}`}>
            {sidebar}
          </div>
          <WorkbenchResizeHandle {...pane.handleProps} hidden={stacked} />
        </>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
