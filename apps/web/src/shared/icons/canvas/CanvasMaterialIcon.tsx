import type { SVGProps } from 'react';

/**
 * 素材上传专属矢量图标（重叠卡片与相片，支持属性透传与 currentColor）
 */
export function CanvasMaterialIcon({ className = 'pointer-events-none shrink-0', width = 14, height = 14, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.3 7.4 3.5 10a1.6 1.6 0 0 0-1.2 1.9L5.6 27a1.6 1.6 0 0 0 1.9 1.2L19 25.7" />
        <path d="m6.7 22.6 2.6-5 3 3 1.3-2.5 1.9 2.2-8.8 2.3Z" />
        <circle cx="11.1" cy="14.3" r="1.1" fill="currentColor" stroke="none" />
        <rect x="15" y="4" width="15.5" height="21" rx="1.6" transform="rotate(9 15 4)" />
        <path d="M17.2 12.2c3.8-1.4 6.8 1.1 7.4 3.6l2.3-1-1.1 5.8-1.9-2.2c-3.4 1-7.8-1.4-6.7-6.2Z" />
        <circle cx="19.3" cy="13.8" r=".65" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
