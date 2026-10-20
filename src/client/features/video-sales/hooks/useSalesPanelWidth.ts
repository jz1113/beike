import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const WIDTH_KEY = 'beike.video_sales.panel-width.v1';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 360;
const MAX_WIDTH = 640;
const RIGHT_MIN_WIDTH = 560;
const LAYOUT_GAP = 48; // 分隔条 16px，加工作区左右内边距 32px。

export function clampSalesPanelWidth(value: number, available = 1280): number {
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available - RIGHT_MIN_WIDTH - LAYOUT_GAP));
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, Number.isFinite(value) ? value : DEFAULT_WIDTH)));
}

export function readSalesPanelWidth(storage?: Pick<Storage, 'getItem'>): number {
  try {
    const saved = storage?.getItem(WIDTH_KEY);
    return saved ? clampSalesPanelWidth(Number(saved)) : DEFAULT_WIDTH;
  } catch { return DEFAULT_WIDTH; }
}

export function useSalesPanelWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try { return readSalesPanelWidth(typeof window === 'undefined' ? undefined : window.localStorage); } catch { return DEFAULT_WIDTH; }
  });
  const [available, setAvailable] = useState(0);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const wide = available >= 1080;
  const width = clampSalesPanelWidth(preferredWidth, available);
  const maxWidth = clampSalesPanelWidth(MAX_WIDTH, available);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setAvailable(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resize = useCallback((next: number) => {
    const value = clampSalesPanelWidth(next, available);
    setPreferredWidth(value);
    try { window.localStorage.setItem(WIDTH_KEY, String(value)); } catch { /* 本地存储不可用时仍允许调整。 */ }
  }, [available]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const next = event.key === 'ArrowLeft' ? width - step : event.key === 'ArrowRight' ? width + step : event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? maxWidth : null;
    if (next === null) return;
    event.preventDefault();
    resize(next);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) resize(drag.current.width + event.clientX - drag.current.x);
  };
  const onPointerUp = () => { drag.current = null; };

  return { containerRef, wide, width, separatorProps: {
    role: 'separator' as const, tabIndex: 0, 'aria-label': '调整商品面板宽度',
    'aria-orientation': 'vertical' as const, 'aria-valuemin': MIN_WIDTH, 'aria-valuemax': maxWidth,
    'aria-valuenow': width, 'aria-valuetext': `${width} 像素`,
    onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp,
  } };
}
