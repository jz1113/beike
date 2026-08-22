/** 全应用复用的响应式布局 class 组合 */

/** 主视图根容器 */
export const pageRoot =
  'flex-1 min-w-0 h-full overflow-hidden flex flex-col';

/** 左右分栏主视图根容器（侧边栏 + 主画布） */
export const pageRootSplit =
  'flex-1 min-w-0 h-full overflow-hidden flex flex-row';

/** 顶栏：允许换行、防止 flex 子项撑破 */
export const pageToolbar =
  'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 min-w-0';

/** 顶栏左右分区 */
export const pageToolbarStart = 'flex flex-wrap items-center gap-2 min-w-0';
export const pageToolbarEnd =
  'flex flex-wrap items-center gap-2 min-w-0 shrink-0';

/** 筛选/批量操作工具条 */
export const subToolbar =
  'flex flex-wrap items-center gap-2 min-w-0';

/** 工具条横向溢出时可滚动 */
export const subToolbarScroll =
  'flex items-center gap-2 min-w-0 overflow-x-auto scroll-contain';

/** 自适应画廊网格 */
export const autoFillGrid =
  'grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 sm:gap-4';

/** 卡片容器查询根（角标密度随卡片宽度变化） */
export const cardContainer = '@container/card';

/** 窄屏工具栏：纵向堆叠，sm 以上横排 */
export const compactToolbar =
  'flex flex-col sm:flex-row items-stretch sm:items-center gap-y-2 gap-x-2 min-w-0';

/** 紧凑药丸按钮尺寸 */
export const compactPill =
  'h-9 sm:h-11 text-xs sm:text-sm';

/** 滚动区底部留白（配合 --prompt-dock-h CSS 变量） */
export const dockSafeArea =
  'pb-[calc(var(--prompt-dock-h,16rem)+1.5rem)]';
