import type { ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';
import { StudioPopover } from '@client/shared/ui/studio/StudioPopover';
import { salesFocusClass } from './salesChrome';

/**
 * 电商视频工作台统一 56px 底部操作栏
 * 左侧承载当前步骤统计或向上展开的制作设置；右侧固定放置主次行动按钮。
 */
export function SalesBottomActionBar({
  left,
  right,
  ariaLabel = '步骤底部操作栏',
  className = '',
}: {
  left?: ReactNode;
  right?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <footer className={`sales-actionbar ${className}`.trim()} aria-label={ariaLabel}>
      <div className="sales-actionbar-left">{left}</div>
      <div className="sales-actionbar-right">{right}</div>
    </footer>
  );
}

/**
 * 底部操作栏专用的向上展开下拉器（Drop-up）
 * 支持点击外部与按 Escape 键自动收起，避免遮挡上方表格或播放器。
 */
export function SalesDropup({
  label,
  value,
  thumbUrl,
  disabled = false,
  align = 'left',
  widthClass = 'w-[300px]',
  ariaLabel,
  children,
}: {
  label: string;
  value: ReactNode;
  thumbUrl?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  widthClass?: string;
  ariaLabel?: string;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <StudioPopover
      disabled={disabled}
      className={(open) => `sales-dropup ${open ? 'is-open' : ''}`}
      panelLabel={`${label}选择面板`}
      panelClassName={`sales-dropup-menu ${align === 'right' ? 'is-right' : ''} ${widthClass}`}
      trigger={({ open, toggle, ariaControls }) => (
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel || `${label}设置`}
          aria-expanded={open}
          aria-controls={ariaControls}
          onClick={toggle}
          className={`sales-dropup-btn ${salesFocusClass}`}
        >
          <span className="sales-dropup-key">{label}</span>
          {thumbUrl ? <img src={thumbUrl} alt="" className="sales-dropup-thumb" aria-hidden /> : null}
          <span className="sales-dropup-val" title={typeof value === 'string' ? value : undefined}>{value}</span>
          <ChevronUp size={13} className={`sales-dropup-caret ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}
    >
      {({ close }) => children(close)}
    </StudioPopover>
  );
}

