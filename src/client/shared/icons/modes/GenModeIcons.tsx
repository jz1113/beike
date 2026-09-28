import type { SVGProps } from 'react';

export type GenModeIconProps = SVGProps<SVGSVGElement> & {
  className?: string;
};

const defaultClassName = 'w-4 h-4 flex-shrink-0';

/** 深度图片剪影：圆角外框 + 太阳圆 + 底部双峰（evenodd 镂空） */
const DEPTH_IMAGE_SILHOUETTE_PATH = [
  'M7.5 4H16.5A3.5 3.5 0 0120 7.5V16.5A3.5 3.5 0 0116.5 20H7.5A3.5 3.5 0 014 16.5V7.5A3.5 3.5 0 017.5 4Z',
  'M8.25 6.5A1.75 1.75 0 108.25 10A1.75 1.75 0 108.25 6.5Z',
  'M6.75 17.25L9.5 14.5L12 16.75L15.25 13.25L18.5 17.25V17.75H6.75V17.25Z',
].join('');

/** 图片生成 · 描边风景图标 */
export function ImageGenModeIcon({ className = defaultClassName, ...props }: GenModeIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.25" cy="8.25" r="1.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 17.5L9.75 12.25L14.25 15.75L20 11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 视频生成 · 描边摄像机图标 */
export function VideoGenModeIcon({ className = defaultClassName, ...props }: GenModeIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden {...props}>
      <rect x="3.5" y="5.5" width="12.5" height="13" rx="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="7.25" cy="9" r="1.25" fill="currentColor" stroke="none" />
      <path
        d="M16 9.75L21 7.25V16.75L16 14.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 深度图片 · 纯黑实心剪影 */
export function DepthImageModeIcon({ className = defaultClassName, ...props }: GenModeIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d={DEPTH_IMAGE_SILHOUETTE_PATH}
      />
    </svg>
  );
}

/** 深度视频 · 纯黑实心摄像机剪影 */
export function DepthVideoModeIcon({ className = defaultClassName, ...props }: GenModeIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...props}>
      <rect x="2.5" y="6.5" width="10.5" height="11" fill="currentColor" />
      <path fill="currentColor" d="M14.75 8.75l6.75-3.5v13.5l-6.75-3.5V8.75z" />
    </svg>
  );
}
