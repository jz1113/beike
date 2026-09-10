import type { SVGProps } from 'react';
import type { AssistantSkill } from '@beike/domain/assistant/skills/types';

export interface AssistantSkillIconProps extends SVGProps<SVGSVGElement> {
  className?: string;
}

/** 
 * 技能标准矢量图标（纯净 SVG，契合极简轻奢质感）
 */
export function AssistantSkillIcon({
  className = 'w-4 h-4',
  strokeWidth = 1.6,
  ...props
}: AssistantSkillIconProps) {
  const barStroke = typeof strokeWidth === 'number' ? strokeWidth + 0.2 : 1.8;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <line x1="8.5" y1="8" x2="8.5" y2="13" strokeWidth={barStroke} />
      <line x1="12.5" y1="8" x2="12.5" y2="13" strokeWidth={barStroke} />
    </svg>
  );
}

/**
 * 技能卡片图标：直接使用技能纯净 SVG，不加任何彩色背景框（对齐用户指示与系统设计）
 */
export function AssistantSkillCardIcon({ size = 'md', className = '' }: {
  skill?: Partial<AssistantSkill> | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }[size];

  return (
    <AssistantSkillIcon
      className={`${sizeClasses} text-amber-500 shrink-0 ${className}`}
      strokeWidth={1.8}
    />
  );
}
