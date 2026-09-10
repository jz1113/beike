import type { SVGProps } from 'react';

/**
 * 画布左侧侧边栏 · 本地上传图标 (向上箭头 + 托盘横线)
 */
export function CanvasUploadIcon({ className = 'w-4 h-4', strokeWidth = 1.9, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M12 3v12" />
      <path d="m6 9 6-6 6 6" />
      <path d="M4 19h16" />
    </svg>
  );
}

/**
 * 画布左侧侧边栏 · 导入资产折角文件夹图标
 */
export function CanvasAssetFolderIcon({ className = 'w-4 h-4', strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}
