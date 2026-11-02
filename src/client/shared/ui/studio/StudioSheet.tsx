import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface StudioSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  side?: 'right' | 'left';
  /** 面板宽度类名，默认右侧检查器 400px，大型图鉴可传更宽尺寸 */
  widthClassName?: string;
  /** 是否允许不阻断背后画布查看（弱化遮罩层） */
  nonBlocking?: boolean;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * 轻奢毛玻璃侧滑抽屉（Studio Sheet）
 * 用于非阻塞属性检查器（Inspector）与开源图鉴中心（Atlas Hub），避免居中弹窗遮挡分镜上下文。
 */
export function StudioSheet({
  open,
  onClose,
  title,
  subtitle,
  side = 'right',
  widthClassName = 'w-full max-w-[420px]',
  nonBlocking = false,
  headerExtra,
  footer,
  children,
}: StudioSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const sideClasses = side === 'right'
    ? 'right-0 border-l'
    : 'left-0 border-r';

  return (
    <div
      className={`fixed inset-0 z-50 flex ${nonBlocking ? 'pointer-events-none' : ''}`}
      role="dialog"
      aria-modal={!nonBlocking}
      aria-labelledby={titleId}
    >
      {/* 背景遮罩：非阻塞检查器模式下点击画布空白也可收起，或保持极轻遮罩方便对照分镜 */}
      {!nonBlocking ? (
        <div
          className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] transition-opacity dark:bg-black/60"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : (
        <div
          className="pointer-events-auto fixed inset-0 bg-slate-950/10 transition-opacity dark:bg-black/25"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`pointer-events-auto fixed inset-y-0 ${sideClasses} ${widthClassName} z-10 flex flex-col border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 dark:border-white/10 dark:bg-[#15161A]/95`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/75 px-5 py-4 dark:border-white/[0.08]">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label={`关闭${title}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white/80 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-slate-200/75 bg-slate-50/80 px-5 py-3.5 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#111216]/90">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

