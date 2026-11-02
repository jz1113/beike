/**
 * 电商视频（Sales Studio）v5 中性工具美学原子类名
 * 采用克制灰阶、1px 细线分栏、5-6px 紧凑圆角与墨黑/纯白高对比主按钮，杜绝 AI 蓝紫渐变与毛玻璃套框。
 */

export const salesFocusClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/60 focus-visible:ring-offset-1 dark:focus-visible:ring-stone-100/70 dark:focus-visible:ring-offset-[#181818]';

export const salesLabelClass =
  'block text-xs font-semibold tracking-tight text-[#1C1917] dark:text-[#ECECEC]';

export const salesInputClass =
  'sales-input mt-1 w-full min-w-0 rounded-[5px] border border-[#E5E5E3] bg-white px-2.5 py-1.5 text-[12.5px] text-[#1C1917] outline-none transition placeholder:text-[#8A8680] focus:border-[#1C1917] disabled:opacity-50 dark:border-[#2A2A2A] dark:bg-[#141414] dark:text-[#ECECEC] dark:placeholder:text-[#71717A] dark:focus:border-[#ECECEC]';

export const salesPrimaryButtonClass =
  `sales-collect-primary inline-flex items-center justify-center gap-1.5 rounded-[5px] bg-[#1C1917] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2E2A27] disabled:pointer-events-none disabled:opacity-40 dark:bg-[#F0F0EE] dark:text-[#111111] dark:hover:bg-white ${salesFocusClass}`;

export const salesGhostButtonClass =
  `sales-button-secondary inline-flex items-center justify-center gap-1.5 rounded-[5px] border border-[#D4D4D1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C1917] transition hover:bg-[#EFEFED] disabled:pointer-events-none disabled:opacity-40 dark:border-[#3A3A3A] dark:bg-[#181818] dark:text-[#ECECEC] dark:hover:bg-[#242424] ${salesFocusClass}`;

export const salesSurfaceCardClass =
  'rounded-[6px] border border-[#E5E5E3] bg-white dark:border-[#2A2A2A] dark:bg-[#181818]';

export const salesSubtlePanelClass =
  'rounded-[6px] border border-[#E5E5E3] bg-[#F4F4F3] dark:border-[#2A2A2A] dark:bg-[#141414]';
