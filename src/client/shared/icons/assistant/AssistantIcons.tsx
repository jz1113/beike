import type { SVGProps } from 'react';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
// Brand favicon linked by https://wan.video/; bundled locally for offline display.
import wanLogo from '@client/assets/model-logos/wan.ico';

export interface AssistantSkillIconProps extends SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * 技能标准矢量图标（用于输入栏小按钮等紧凑触发器）
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

function resolveSkillKind(skill?: Partial<AssistantSkill> | null): string {
  const icon = skill?.icon?.trim().toLowerCase() || '';
  if (icon === 'image' || icon === 'sparkle') return 'image';
  if (icon === 'sparkles') return 'sparkles';
  if (icon === 'film') return 'film';
  if (icon === 'video') return 'video';
  if (icon === 'waveform') return 'waveform';
  if (icon === 'camera') return 'camera';
  if (icon === 'shirt') return 'shirt';
  return 'default';
}

/**
 * 技能卡片图标：对齐 Codex 风格的多彩圆角矩形应用级图标（参考图 2 与图 3）
 */
export function AssistantSkillCardIcon({
  skill,
  size = 'md',
  className = '',
}: {
  skill?: Partial<AssistantSkill> | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-9 h-9 rounded-[11px]',
    md: 'w-10 h-10 rounded-[12px]',
    lg: 'w-11 h-11 rounded-[13px]',
  }[size];

  const kind = resolveSkillKind(skill);

  if(skill?.modelIcon) return <span aria-hidden="true" className={`${sizeClasses} flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 p-1.5 dark:bg-white/[0.06] ${className}`}>
    {skill.modelIcon.startsWith('wan')
      ? <img src={wanLogo} alt="" draggable={false} className="h-full w-full object-contain" />
      : <ModelIcon modelId={skill.modelIcon} className="h-full w-full" />}
  </span>;

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={`${sizeClasses} shrink-0 overflow-hidden shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] ${className}`}
    >
      {kind === 'image' && (
        <>
          <rect width="40" height="40" rx="10" fill="#5CC8FF" />
          <circle cx="13" cy="13.5" r="4.2" fill="#FFE066" />
          <path d="M0 29.5C6.5 23.5 14.5 23 22 28.5C27.5 32.5 34 34 40 31V40H0V29.5Z" fill="#74E39A" />
          <path d="M14 40C20.5 29.5 30 25.5 40 28.5V40H14Z" fill="#3CCB7F" />
        </>
      )}
      {kind === 'sparkles' && (
        <>
          <rect width="40" height="40" rx="10" fill="#E0F7FA" />
          <rect x="4" y="4" width="32" height="32" rx="8" fill="#06B6D4" fillOpacity="0.14" />
          <path d="M20 8.5L22.4 15.6L29.5 18L22.4 20.4L20 27.5L17.6 20.4L10.5 18L17.6 15.6L20 8.5Z" fill="#0891B2" />
          <circle cx="28.5" cy="11.5" r="2.2" fill="#22D3EE" />
          <circle cx="12" cy="28" r="1.8" fill="#06B6D4" />
        </>
      )}
      {kind === 'film' && (
        <>
          <rect width="40" height="40" rx="10" fill="#FFF0E6" />
          <rect x="7" y="10" width="26" height="20" rx="5" fill="#F97316" />
          <path d="M17.5 16.2L24.2 20L17.5 23.8V16.2Z" fill="#FFFFFF" />
          <circle cx="11.5" cy="14" r="1.2" fill="#FFEDD5" />
          <circle cx="28.5" cy="14" r="1.2" fill="#FFEDD5" />
        </>
      )}
      {kind === 'video' && (
        <>
          <rect width="40" height="40" rx="10" fill="#EFF6FF" />
          <circle cx="20" cy="20" r="12" fill="#3B82F6" />
          <path d="M17.5 15.2L25.2 20L17.5 24.8V15.2Z" fill="#FFFFFF" />
        </>
      )}
      {kind === 'waveform' && (
        <>
          <rect width="40" height="40" rx="10" fill="#FFE4E6" />
          <rect x="9" y="16" width="3.2" height="8" rx="1.6" fill="#F43F5E" />
          <rect x="14.5" y="11" width="3.2" height="18" rx="1.6" fill="#E11D48" />
          <rect x="20" y="14" width="3.2" height="12" rx="1.6" fill="#F43F5E" />
          <rect x="25.5" y="9.5" width="3.2" height="21" rx="1.6" fill="#BE123C" />
          <rect x="31" y="15.5" width="3.2" height="9" rx="1.6" fill="#FB7185" />
        </>
      )}
      {kind === 'camera' && (
        <>
          <rect width="40" height="40" rx="10" fill="#F3E8FF" />
          <rect x="8" y="12" width="24" height="17" rx="4.5" fill="#8B5CF6" />
          <circle cx="20" cy="20.5" r="5" fill="#EDE9FE" />
          <circle cx="20" cy="20.5" r="2.4" fill="#6D28D9" />
          <rect x="14" y="9.5" width="6" height="3" rx="1.2" fill="#7C3AED" />
        </>
      )}
      {kind === 'shirt' && (
        <>
          <rect width="40" height="40" rx="10" fill="#FCE7F3" />
          <path d="M14.5 11L17 13.5C18.6 15 21.4 15 23 13.5L25.5 11L31 15L28.2 19.5L25.5 18V29H14.5V18L11.8 19.5L9 15L14.5 11Z" fill="#EC4899" />
        </>
      )}
      {kind === 'default' && (
        <>
          <rect width="40" height="40" rx="10" fill="#F1F5F9" />
          <rect x="9" y="9" width="22" height="22" rx="6" fill="#475569" />
          <path d="M16 15V22M21 15V22" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
