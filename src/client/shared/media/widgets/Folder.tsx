'use client';

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import './Folder.css';

import type {
  FolderEntry,
  FolderItem,
  FolderProps,
  Renderer,
  Settings,
} from './folder/folderTypes';
import {
  DEFAULT_ITEMS,
  MAX_ITEMS,
  backPath,
  clamp,
  luma,
  measureFolder,
  mixRgb,
  parseColor,
  rgbString,
} from './folder/folderMath';
import { renderItem } from './folder/FolderItemRenderer';
import { createGlass } from './folder/folderShaders';
import { useFolderEngine } from './folder/useFolderEngine';

export type { FolderProps, FolderEntry, FolderItem };

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const Folder = ({
  count: badgeCount,
  badgeSuffix,
  interactive = true,
  ariaLabel,
  onClick,
  items,
  label,
  mode = 'flap',
  variant = 'solid',
  color = '#3d8bff',
  paperColor = '#ffffff',
  tabPosition = 'right',
  layout = 'spread',
  size = 1,
  openOn = 'click',
  open,
  defaultOpen = false,
  onOpenChange,
  onItemClick,
  onItemDrop,
  draggable = true,
  zoomOnClick = true,
  peek = true,
  intro = true,
  tilt = 0.5,
  bounce = 0.4,
  speed = 1,
  frost = 0.25,
  closeOnOutsideClick = true,
  theme = 'dark',
  className = '',
  style,
  children,
}: FolderProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLSpanElement>(null);
  const castRef = useRef<HTMLSpanElement>(null);
  const shadeRef = useRef<HTMLSpanElement>(null);
  const glassRef = useRef<HTMLCanvasElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measureRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [labelWidth, setLabelWidth] = useState(0);
  const [gpu, setGpu] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? Boolean(open) : internalOpen;
  const book = mode === 'book';
  const glass = variant === 'glass';

  const entries = useMemo<FolderEntry[]>(() => {
    const custom = Children.toArray(children).filter(isValidElement);
    const source = (custom.length ? custom : items?.length ? items : DEFAULT_ITEMS) as FolderEntry[];
    return source.slice(0, MAX_ITEMS);
  }, [children, items]);
  const count = entries.length;

  const scale = Math.max(0.3, Number(size) || 1);
  const g = measureFolder(book, scale, labelWidth, Boolean(label), tabPosition);
  const total = g.tabH + g.h;
  const view = book
    ? { x: -0.75 * g.w, y: -0.25 * total, width: 2.5 * g.w, height: 1.5 * total }
    : { x: -0.25 * g.w, y: -0.1 * total, width: 1.5 * g.w, height: 1.3 * total };

  useIsomorphicLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return undefined;
    let active = true;
    const measure = () => {
      if (active) setLabelWidth(node.offsetWidth);
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      active = false;
    };
  }, [label, scale]);

  const setOpen = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      const value = typeof next === 'function' ? next(isOpen) : next;
      if (!isControlled) setInternalOpen(value);
      if (value !== isOpen) onOpenChange?.(value);
    },
    [isControlled, isOpen, onOpenChange]
  );

  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  const rgb = parseColor(color);
  const paper = parseColor(paperColor);
  const backTone = mixRgb(rgb, [0, 0, 0], 0.16);
  const insideTop = rgbString(mixRgb(rgb, [0, 0, 0], 0.08));
  const insideBottom = rgbString(backTone);

  const settingsRef = useRef<Settings>({} as Settings);
  settingsRef.current = {
    open: isOpen,
    layout,
    openOn,
    peek,
    intro,
    draggable,
    zoomOnClick,
    closeOnOutsideClick,
    onItemClick,
    onItemDrop,
    tilt: clamp(tilt, 0, 1.5),
    bounce: clamp(bounce, 0, 1),
    speed: clamp(speed, 0.2, 3),
    frost: clamp(frost, 0, 1),
    count,
    entries,
    glass,
    light: theme === 'light',
    tint: rgb,
    insideTop,
    insideBottom,
    insideTone: [mixRgb(rgb, [0, 0, 0], 0.08).map(v => v / 255), backTone.map(v => v / 255)],
    content: `${mode}|${scale}|${paperColor}|${color}|${g.tabX}|${g.tabW}`,
    depth: Math.round(Math.max(g.w, g.h) * 5),
    view,
    g,
  };

  const { engineRef, outside } = useFolderEngine(
    { rootRef, backRef, frontRef, groundRef, castRef, shadeRef, glassRef, itemRefs },
    settingsRef,
    rendererRef,
    setOpenRef
  );

  useEffect(() => {
    if (!glass) return undefined;
    const canvas = glassRef.current;
    if (!canvas) return undefined;
    const renderer = createGlass(canvas);
    if (!renderer) return undefined;
    rendererRef.current = renderer;
    setGpu(true);
    const onLost = (event: Event) => {
      event.preventDefault();
      rendererRef.current = null;
      setGpu(false);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    engineRef.current?.invalidate();
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
      setGpu(false);
    };
  }, [glass, engineRef]);

  useEffect(() => {
    engineRef.current?.wake();
  });

  const toggle = () => {
    if (engineRef.current?.blur()) return;
    if (openOn === 'hover') return;
    setOpen(!isOpen);
  };

  const onItemActivate = (event: ReactMouseEvent<HTMLDivElement>, index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.consumeClick()) {
      event.stopPropagation();
      return;
    }
    if (!engine.interactive(index)) return;
    event.stopPropagation();
    engine.select(index);
  };

  const vars = {
    '--folder-rgb': rgb.join(', '),
    '--folder-base': rgbString(rgb),
    '--folder-front-top': rgbString(mixRgb(rgb, [255, 255, 255], 0.12)),
    '--folder-front-bottom': rgbString(mixRgb(rgb, [0, 0, 0], 0.06)),
    '--folder-inside-top': insideTop,
    '--folder-inside-bottom': insideBottom,
    '--folder-tab-ink': luma(backTone) > 0.6 ? 'rgba(0, 0, 0, 0.72)' : 'rgba(255, 255, 255, 0.92)',
    '--folder-paper': rgbString(paper),
    '--folder-paper-ink': rgbString(mixRgb(paper, [0, 0, 0], 0.11)),
    '--folder-paper-ink-strong': rgbString(mixRgb(paper, [0, 0, 0], 0.28)),
    '--folder-paper-text': rgbString(mixRgb(paper, [0, 0, 0], 0.72)),
    '--folder-w': `${g.w}px`,
    '--folder-h': `${g.h}px`,
    '--folder-tab-h': `${g.tabH}px`,
    '--folder-front-y': `${g.frontTop}px`,
    '--folder-front-h': `${g.frontH}px`,
    '--folder-r': `${g.r}px`,
    '--folder-front-radius': book ? `0 ${g.r}px ${g.r}px 0` : `${g.r}px`,
    '--folder-doc-w': `${g.docW}px`,
    '--folder-doc-h': `${g.docH}px`,
    '--folder-frost': `${(1.5 + clamp(frost, 0, 1) * 10) * scale}px`,
    '--folder-depth': `${settingsRef.current?.depth ?? 1000}px`,
    '--folder-scale': scale,
    ...style,
  } as CSSProperties;

  const shape = backPath(g);

  return (
    <div
      ref={rootRef}
      className={`folder-root${interactive ? '' : ' pointer-events-none'}${className ? ` ${className}` : ''}`}
      data-mode={book ? 'book' : 'flap'}
      data-variant={variant}
      data-theme={theme === 'light' ? 'light' : 'dark'}
      data-open={isOpen ? '' : undefined}
      data-gl={glass && gpu ? '' : undefined}
      data-draggable={draggable ? '' : undefined}
      style={vars}
      onClick={onClick}
    >
      <div
        className="folder-stage"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label={ariaLabel || (label ? `${label} folder` : 'Folder')}
        onClick={toggle}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <span ref={groundRef} className="folder-layer folder-ground" aria-hidden="true" />
        {book && <span ref={castRef} className="folder-layer folder-cast" aria-hidden="true" />}

        <div ref={backRef} className="folder-layer folder-back" aria-hidden="true">
          <div className="folder-back-fill" style={{ clipPath: `path('${shape}')` }}>
            {book && <span className="folder-gutter" />}
          </div>
          <svg className="folder-back-rim" width={g.w} height={total} viewBox={`0 0 ${g.w} ${total}`}>
            <path className="folder-focus" d={shape} />
          </svg>
          {label && (
            <span className="folder-tab-text" style={{ left: g.tabX, width: g.tabW }}>
              {label}
            </span>
          )}
        </div>

        {entries.map((item, index) => {
          const itemInteractive = isOpen || outside.includes(index);
          return (
            <div
              key={isValidElement(item) && item.key != null ? item.key : index}
              ref={node => {
                itemRefs.current[index] = node;
              }}
              className="folder-layer folder-item"
              data-folder-item={index}
              role={itemInteractive ? 'button' : undefined}
              tabIndex={itemInteractive ? 0 : -1}
              onClick={event => onItemActivate(event, index)}
              onKeyDown={event => {
                if (!itemInteractive || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                event.stopPropagation();
                engineRef.current?.select(index);
              }}
            >
              {renderItem(item)}
            </div>
          );
        })}

        {book && <span ref={shadeRef} className="folder-layer folder-shade" aria-hidden="true" />}

        <div ref={frontRef} className="folder-layer folder-front" data-face="outer" aria-hidden="true">
          {badgeCount !== undefined && (
            <div className="absolute bottom-1.5 right-2 z-50 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold font-mono shadow-xs pointer-events-none">
              {badgeCount}{badgeSuffix || 'P'}
            </div>
          )}
          <div className="folder-face folder-face-outer" />
          {book && (
            <div className="folder-face folder-face-inner">
              <span className="folder-inner-gutter" />
            </div>
          )}
        </div>

        {glass && (
          <canvas
            ref={glassRef}
            className="folder-glass"
            aria-hidden="true"
            style={{ left: view.x, top: view.y, width: view.width, height: view.height }}
          />
        )}
      </div>

      {label && (
        <span ref={measureRef} className="folder-tab-text folder-measure" aria-hidden="true">
          {label}
        </span>
      )}
    </div>
  );
};

export const MemoizedFolder = Folder;
export default Folder;
