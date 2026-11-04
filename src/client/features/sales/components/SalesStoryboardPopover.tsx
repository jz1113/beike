import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const OPEN_EVENT = 'sales-storyboard-popover-open';

interface Props {
  trigger: ReactNode;
  triggerClassName: string;
  label: string;
  disabled: boolean;
  align?: 'left' | 'right';
  children: ReactNode | (() => ReactNode);
}

/** A single active cell editor stays inside the visible storyboard scroll area. */
export function SalesStoryboardPopover({
  trigger, triggerClassName, label, disabled, align = 'left', children,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const isOpen = open && !disabled;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const opened = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== panelId) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    document.addEventListener(OPEN_EVENT, opened);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener(OPEN_EVENT, opened);
    };
  }, [isOpen, panelId]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const root = rootRef.current;
    const triggerElement = triggerRef.current;
    const panel = root?.querySelector<HTMLElement>('.sales-sb-popover-card');
    if (!root || !triggerElement || !panel) return;
    const scroll = root.closest<HTMLElement>('.sales-sb-table-scroll');
    const reposition = () => {
      const anchor = triggerElement.getBoundingClientRect();
      const scrollBounds = scroll?.getBoundingClientRect();
      const headerBottom = scroll?.querySelector('thead')?.getBoundingClientRect().bottom || 0;
      const topEdge = Math.max(0, scrollBounds?.top || 0, headerBottom) + 8;
      const bottomEdge = Math.min(window.innerHeight, scrollBounds?.bottom ?? window.innerHeight) - 8;
      const leftEdge = Math.max(0, scrollBounds?.left || 0) + 8;
      const rightEdge = Math.min(window.innerWidth, scrollBounds?.right ?? window.innerWidth) - 8;
      if (anchor.bottom < topEdge || anchor.top > bottomEdge || anchor.right < leftEdge || anchor.left > rightEdge) {
        setOpen(false);
        return;
      }
      panel.style.boxSizing = 'border-box';
      panel.style.maxWidth = `${Math.max(0, rightEdge - leftEdge)}px`;
      const below = Math.max(0, bottomEdge - anchor.bottom - 4);
      const above = Math.max(0, anchor.top - topEdge - 4);
      const side = below < panel.scrollHeight && above > below ? 'top' : 'bottom';
      root.dataset.side = side;
      panel.style.maxHeight = `${Math.floor(side === 'top' ? above : below)}px`;
      panel.style.overflowY = 'auto';
      panel.style.overscrollBehavior = 'contain';
      panel.style.transform = '';
      const bounds = panel.getBoundingClientRect();
      const shift = bounds.left < leftEdge ? leftEdge - bounds.left : bounds.right > rightEdge ? rightEdge - bounds.right : 0;
      if (shift) panel.style.transform = `translateX(${shift}px)`;
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    observer?.observe(panel);
    if (scroll) observer?.observe(scroll);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      observer?.disconnect();
    };
  }, [isOpen, children]);

  return (
    <details ref={rootRef} open={isOpen} data-side="bottom"
      className={`sales-sb-cell-popover${align === 'right' ? ' is-right' : ''}`}>
      <summary ref={triggerRef} className={triggerClassName} title={label} aria-label={label}
        aria-controls={panelId} aria-expanded={isOpen} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
        onClick={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (!open) document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panelId }));
          setOpen((value) => !value);
        }}>
        {trigger}
      </summary>
      <div id={panelId} role="dialog" aria-label={label}>{typeof children === 'function' ? isOpen && children() : children}</div>
    </details>
  );
}
