import type { SVGProps } from 'react';

/**
 * 重新编辑图标 (圆角气泡框带右下斜向尾巴)
 */
export function ReEditIcon({ className = 'w-[15px] h-[15px] shrink-0', strokeWidth = 1.9, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M2.5 5.2C2.5 3.71 3.71 2.5 5.2 2.5H10.8C12.29 2.5 13.5 3.71 13.5 5.2V8.5C13.5 9.3 13.1 10.05 12.4 10.55L13.8 13.2C13.92 13.43 13.67 13.68 13.44 13.55L10.3 11.5H5.2C3.71 11.5 2.5 10.29 2.5 8.8V5.2Z" />
    </svg>
  );
}

/**
 * 再次生成图标 (饱满的双向回环箭头)
 */
export function RegenerateIcon({ className = 'w-[15px] h-[15px] shrink-0', strokeWidth = 1.9, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.2 2.2L7.6 2.3C10.8 2.5 13.5 5.2 13.5 8.4C13.5 9.1 13.35 9.8 13.05 10.4" />
      <path d="M9.8 13.8L8.4 13.7C5.2 13.5 2.5 10.8 2.5 7.6C2.5 6.9 2.65 6.2 2.95 5.6" />
      <path d="M4.5 3.8L6.2 2.2L6 4.4" />
      <path d="M11.5 12.2L9.8 13.8L10 11.6" />
    </svg>
  );
}
