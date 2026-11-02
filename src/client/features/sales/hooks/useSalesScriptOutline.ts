import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  wideLayout: boolean;
  scriptKey: string;
}

const SEGMENT_TOP_GAP = 20;

function segmentIndex(segment: HTMLElement): number | null {
  const index = Number(segment.id.replace('sales-script-segment-', ''));
  return Number.isInteger(index) && index > 0 ? index : null;
}

export function useSalesScriptOutline({ wideLayout, scriptKey }: Options) {
  const shellRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [activeSegment, setActiveSegment] = useState<number | null>(null);

  useEffect(() => {
    const root = wideLayout ? documentRef.current : shellRef.current;
    if (!root) return;
    let frame: number | null = null;

    const updateActiveSegment = () => {
      frame = null;
      const segments = Array.from(root.querySelectorAll<HTMLElement>('.sales-storyboard-segment'));
      if (!segments.length || !root.clientHeight) {
        setActiveSegment(null);
        return;
      }

      const viewportTop = root.getBoundingClientRect().top + root.clientTop;
      let active: number | null = null;
      for (const segment of segments) {
        if (segment.getBoundingClientRect().top > viewportTop + SEGMENT_TOP_GAP + 1) break;
        active = segmentIndex(segment);
      }
      const atBottom = root.scrollTop > 0 && root.scrollHeight - root.clientHeight - root.scrollTop <= 2;
      if (atBottom) active = segmentIndex(segments[segments.length - 1]);
      setActiveSegment(active);
    };

    const scheduleUpdate = () => {
      if (frame === null) frame = requestAnimationFrame(updateActiveSegment);
    };

    root.addEventListener('scroll', scheduleUpdate, { passive: true });
    root.addEventListener('toggle', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    observer?.observe(root);
    if (documentRef.current && documentRef.current !== root) observer?.observe(documentRef.current);
    scheduleUpdate();

    return () => {
      root.removeEventListener('scroll', scheduleUpdate);
      root.removeEventListener('toggle', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [wideLayout, scriptKey]);

  const navigateToSegment = useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 1) return;
    const root = wideLayout ? documentRef.current : shellRef.current;
    const target = root?.querySelector<HTMLElement>(`#sales-script-segment-${index}`);
    if (!root || !target) return;
    const top = root.scrollTop + target.getBoundingClientRect().top
      - root.getBoundingClientRect().top - root.clientTop - SEGMENT_TOP_GAP;
    root.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    target.focus({ preventScroll: true });
    setActiveSegment(index);
  }, [wideLayout]);

  return { shellRef, documentRef, activeSegment, navigateToSegment };
}
