import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const EDGE_PADDING = 16;
const PANEL_GAP = 8;
const PANEL_WIDTH = 480;
const PANEL_MAX_HEIGHT = 448;

interface PopoverLayout {
  isUp: boolean;
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/** Keep parameter menus inside the visible workspace, with scrolling when neither side fits. */
export function usePromptBarPopoverLayout(
  isOpen: boolean,
  preferUp: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelWidth = PANEL_WIDTH,
  panelMaxHeight = PANEL_MAX_HEIGHT,
  shrinkToContent = false,
  portal = false,
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<PopoverLayout | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setLayout(null);
      return;
    }
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const viewport = window.visualViewport;
    const update = () => {
      const bounds = {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
        bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
      };
      // Workspace containers also clip menus, especially beside the sidebar on narrow screens.
      for (let parent = portal ? null : anchor.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          bounds.left = Math.max(bounds.left, rect.left + parent.clientLeft);
          bounds.right = Math.min(bounds.right, rect.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          bounds.top = Math.max(bounds.top, rect.top + parent.clientTop);
          bounds.bottom = Math.min(bounds.bottom, rect.top + parent.clientTop + parent.clientHeight);
        }
      }

      const rect = anchor.getBoundingClientRect();
      const available = Math.max(0, bounds.right - bounds.left - EDGE_PADDING * 2);
      let width = Math.min(panelWidth, available);
      if (shrinkToContent) {
        const previousWidth = panel.style.width;
        panel.style.width = 'max-content';
        const natural = Math.ceil(panel.getBoundingClientRect().width);
        panel.style.width = previousWidth;
        if (natural > 0) width = Math.min(width, natural);
      }
      const above = Math.max(0, rect.top - bounds.top - EDGE_PADDING - PANEL_GAP);
      const below = Math.max(0, bounds.bottom - rect.bottom - EDGE_PADDING - PANEL_GAP);
      const desiredHeight = Math.min(panelMaxHeight, panel.scrollHeight + panel.offsetHeight - panel.clientHeight);
      const isUp = preferUp
        ? above >= desiredHeight || above >= below
        : below < desiredHeight && above > below;
      const next = {
        isUp,
        width,
        left: Math.max(bounds.left + EDGE_PADDING, Math.min(rect.left, bounds.right - EDGE_PADDING - width)) - (portal ? 0 : rect.left),
        top: portal && !isUp ? rect.bottom + PANEL_GAP : undefined,
        bottom: portal && isUp ? window.innerHeight - rect.top + PANEL_GAP : undefined,
        maxHeight: Math.min(panelMaxHeight, isUp ? above : below),
      };
      setLayout(previous => previous && Object.keys(next).every(key => previous[key as keyof PopoverLayout] === next[key as keyof PopoverLayout]) ? previous : next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    observer.observe(panel);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [isOpen, preferUp, anchorRef, panelWidth, panelMaxHeight, shrinkToContent, portal]);

  return {
    panelRef,
    opensUp: layout?.isUp ?? preferUp,
    panelStyle: layout ? { left: layout.left, width: layout.width, maxHeight: layout.maxHeight, ...(portal ? { top: layout.top, bottom: layout.bottom } : {}) } : undefined,
  };
}
