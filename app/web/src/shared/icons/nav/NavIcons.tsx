import type { SVGProps } from 'react';

export interface NavIconProps extends SVGProps<SVGSVGElement> {
  active?: boolean;
}

/**
 * 全局导航 · 首页图标 (支持 active 实心与非 active 描边)
 */
export function NavHomeIcon({ active = false, className = 'w-full h-full', ...props }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      {active ? (
        <path
          d="M3 10.182V20C3 20.5523 3.44772 21 4 21H8.5C9.05228 21 9.5 20.5523 9.5 20V15C9.5 14.4477 9.94772 14 10.5 14H13.5C14.0523 14 14.5 14.4477 14.5 15V20C14.5 20.5523 14.9477 21 15.5 21H20C20.5523 21 21 20.5523 21 20V10.182C21 9.59604 20.7428 9.03964 20.2974 8.66014L13.2974 2.69014C12.548 2.05115 11.452 2.05115 10.7026 2.69014L3.70258 8.66014C3.25718 9.03964 3 9.59604 3 10.182Z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M3.70258 8.66014C3.25718 9.03964 3 9.59604 3 10.182V20C3 20.5523 3.44772 21 4 21H8.5C9.05228 21 9.5 20.5523 9.5 20V15C9.5 14.4477 9.94772 14 10.5 14H13.5C14.0523 14 14.5 14.4477 14.5 15V20C14.5 20.5523 14.9477 21 15.5 21H20C20.5523 21 21 20.5523 21 20V10.182C21 9.59604 20.7428 9.03964 20.2974 8.66014L13.2974 2.69014C12.548 2.05115 11.452 2.05115 10.7026 2.69014L3.70258 8.66014Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * 全局导航 · 生成创作双星图标 (支持 active 实心与非 active 描边)
 */
export function NavGenerateIcon({ active = false, className = 'w-full h-full', ...props }: NavIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className} {...props}>
      {active ? (
        <>
          <path
            d="M10 2L12.39 7.61L18 10L12.39 12.39L10 18L7.61 12.39L2 10L7.61 7.61L10 2Z"
            fill="currentColor"
          />
          <path
            d="M18.5 14L19.7 16.8L22.5 18L19.7 19.2L18.5 22L17.3 19.2L14.5 18L17.3 16.8L18.5 14Z"
            fill="currentColor"
          />
        </>
      ) : (
        <>
          <path
            d="M10 2L12.39 7.61L18 10L12.39 12.39L10 18L7.61 12.39L2 10L7.61 7.61L10 2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 14L19.7 16.8L22.5 18L19.7 19.2L18.5 22L17.3 19.2L14.5 18L17.3 16.8L18.5 14Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
