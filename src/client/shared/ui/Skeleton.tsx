import React, { memo } from 'react';

export interface SkeletonProps {
  /** 宽度，可为 CSS 字符串（如 '100%'、'12rem'） */
  width?: string;
  /** 高度，可为 CSS 字符串（如 '1rem'、'48px'） */
  height?: string;
  /** 圆角预设：'btn' | 'card' | 'panel' | 'chip' | 'full' */
  radius?: 'btn' | 'card' | 'panel' | 'chip' | 'full' | string;
  /** 额外的 className */
  className?: string;
  /** aria-busy 等无障碍属性 */
  ariaLabel?: string;
}

/**
 * 通用骨架占位组件。
 * 通过 shimmer 动画（globals.css 定义）提供视觉反馈，避免布局跳动。
 */
function Skeleton({
  width = '100%',
  height = '1rem',
  radius = 'card',
  className = '',
  ariaLabel = '加载中',
}: SkeletonProps) {
  const radiusClass = {
    btn: 'rounded-[var(--radius-btn)]',
    card: 'rounded-[var(--radius-card)]',
    panel: 'rounded-[var(--radius-panel)]',
    chip: 'rounded-[var(--radius-chip)]',
    full: 'rounded-full',
  }[radius] || `rounded-[var(--radius-${radius})]`;

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      style={{ width, height }}
      className={`relative overflow-hidden bg-slate-200/70 ${radiusClass} ${className}`}
    >
      <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />
    </div>
  );
}

export default memo(Skeleton);
