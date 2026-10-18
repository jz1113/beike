import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Render outside the editor's scrolling area so opening controls never moves the node/editor. */
export function CanvasVideoPopover({ anchor, children, width: preferredWidth = 340 }: { anchor: RefObject<HTMLButtonElement | null>; children: ReactNode; width?: number }) {
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 340, maxHeight: 480 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(preferredWidth, window.innerWidth - 24);
      const above = rect.top - 20, below = window.innerHeight - rect.bottom - 20;
      const up = above >= Math.min(480, below);
      const maxHeight = Math.max(80, Math.min(480, up ? above : below));
      const height = Math.min(popup.current?.scrollHeight || 480, maxHeight);
      setPosition({ width, maxHeight, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: Math.max(12, up ? rect.top - height - 8 : rect.bottom + 8) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, preferredWidth]);
  return createPortal(<div ref={popup} data-drawing-settings style={position} className="fixed z-[200] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-700 dark:text-[#C7C7CC] shadow-[0_8px_28px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
    onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{children}</div>, document.body);
}
