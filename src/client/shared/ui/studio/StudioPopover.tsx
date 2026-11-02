import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface StudioPopoverProps {
  /** 触发按钮渲染函数，接收当前展开状态与切换回调 */
  trigger: (props: { open: boolean; toggle: () => void; ariaControls: string }) => ReactNode;
  /** 浮层内容渲染函数，接收关闭回调 */
  children: (props: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  panelClassName?: string;
  panelLabel?: string;
  className?: string | ((open: boolean) => string);
  disabled?: boolean;
}

/**
 * 轻量毛玻璃悬浮选单（Studio Popover）
 * 用于替代裸 <select>：支持分镜可视化选商品缩略图、选姿态动作图、图片视角胶囊打标等。
 */
export function StudioPopover({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  panelClassName,
  panelLabel,
  className = '',
  disabled = false,
}: StudioPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const isOpen = open && !disabled;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (!disabled) setOpen((prev) => !prev);
  };
  const close = () => setOpen(false);

  const alignClass = align === 'right' ? 'right-0' : 'left-0';
  const sideClass = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  const rootClassName = typeof className === 'function' ? className(isOpen) : className;

  return (
    <div ref={rootRef} className={`relative inline-block ${rootClassName}`.trim()}>
      {trigger({ open: isOpen, toggle, ariaControls: panelId })}
      {isOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={panelLabel}
          className={panelClassName ?? `absolute z-40 ${alignClass} ${sideClass} w-64 rounded-xl border border-slate-200/90 bg-white/95 p-2.5 shadow-xl backdrop-blur-xl dark:border-white/12 dark:bg-[#1B1C22]/95`}
        >
          {children({ close })}
        </div>
      ) : null}
    </div>
  );
}
