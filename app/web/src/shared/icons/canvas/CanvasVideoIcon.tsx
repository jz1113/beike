import type { SVGProps } from 'react';

/**
 * 视频生成专属矢量图标（经典摄像机 + 电影镜头 + 播放指示标志，支持属性透传与 currentColor）
 */
export function CanvasVideoIcon({ className = 'pointer-events-none shrink-0', width = 14, height = 14, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect
        x="1.5"
        y="3.25"
        width="8.5"
        height="9.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M10 6.25L14.5 3.5V12.5L10 9.75"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points="4.5,6.25 7.5,8 4.5,9.75"
        fill="currentColor"
      />
    </svg>
  );
}
