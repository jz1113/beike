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

/** 工具条横向溢出时可滚动（无缝隐藏系统滚动条轨道，预留微边距防止切阴影） */
export const subToolbarScroll =
  'flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-none py-0.5 scroll-contain';

/** 自适应画廊网格 */
export const autoFillGrid =
  'grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 sm:gap-4';

/** 卡片容器查询根（角标密度随卡片宽度变化） */
export const cardContainer = '@container/card';

/** 窄屏工具栏：纵向堆叠，sm 以上横排 */
export const compactToolbar =
  'flex flex-col sm:flex-row items-stretch sm:items-center gap-y-2 gap-x-2 min-w-0';

/** 紧凑药丸按钮尺寸（旧版 sm 断点） */
export const compactPill =
  'h-9 sm:h-11 text-xs sm:text-sm';

/** 密度感知药丸：全屏完整 / 中等适中 / 保证文字不被切断 */
export const densityPill =
  'h-8.5 sm:h-9 xl:h-10 text-xs sm:text-[13px] px-2.5 sm:px-3 xl:px-3.5';

/** 密度感知 Dock 内边距 */
export const densityDockPad =
  'p-3 sm:p-3.5 md:p-4.5 xl:p-5.5';

/** 画布式 Composer 卡片内边距（顶部与两侧保持优雅舒适，底部紧致收拢消除透明按钮大面积空隙） */
export const densityComposerPad =
  'pt-3.5 sm:pt-4 md:pt-4.5 xl:pt-5 px-4 sm:px-5 md:px-5.5 xl:px-6 pb-2 sm:pb-2.5 md:pb-2.5 xl:pb-3';

/** 画布式 Composer 圆角 (统一平面 2D 规范圆角) */
export const densityComposerRadius =
  'rounded-2xl';

/** 画布式 Composer 输入区文字字号（精致清秀14px，长文本舒展排成2行） */
export const densityComposerText =
  'text-[14px] sm:text-[14px] md:text-[14.5px]';

/** 画布式 Composer 输入区空态最小高度（饱满舒展呼吸空间，严密匹配用户画框高度） */
export const densityComposerInputMinH =
  'min-h-[88px] sm:min-h-[96px] md:min-h-[102px]';

/** 画布式 Composer 聚焦/长文本展开高度 */
export const densityComposerInputMinHExpanded =
  'min-h-[116px] sm:min-h-[126px] md:min-h-[136px]';

/** 左侧拍立得参考图框（标准 3:4 竖版拍立得便签，宽 68~74px，高 92~98px，经典修长比例，绝不扁平） */
export const densityComposerPolaroidFrame =
  'w-[68px] sm:w-[72px] md:w-[74px] h-[92px] sm:h-[96px] md:h-[98px] aspect-[3/4]';

/** 左侧拍立得参考图框（展开态） */
export const densityComposerPolaroidFrameExpanded =
  'w-[76px] sm:w-[82px] md:w-[86px] h-[104px] sm:h-[110px] md:h-[116px] aspect-[3/4]';

/** 参考图预览框最小高度（横屏图） */
export const MIN_REF_IMAGE_FRAME_HEIGHT = 56;

export type ComposerBreakpoint = 'base' | 'sm' | 'md' | 'xl';

const POLAROID_WIDTHS = {
  normal: { base: 96, sm: 104, md: 112, xl: 116 },
  expanded: { base: 108, sm: 116, md: 124, xl: 128 },
} as const;

const POLAROID_DEFAULT_HEIGHTS = {
  normal: { base: 128, sm: 138, md: 148, xl: 154 },
  expanded: { base: 144, sm: 156, md: 166, xl: 172 },
} as const;

const COMPACT_POLAROID = {
  normal: { width: 88, height: 116 },
  expanded: { width: 96, height: 128 },
} as const;

export function getComposerBreakpoint(): ComposerBreakpoint {
  if (typeof window === 'undefined') return 'md';
  if (window.matchMedia('(min-width: 1280px)').matches) return 'xl';
  if (window.matchMedia('(min-width: 768px)').matches) return 'md';
  if (window.matchMedia('(min-width: 640px)').matches) return 'sm';
  return 'base';
}

export function getComposerPolaroidBaseWidth(
  expanded: boolean,
  compact: boolean,
  bp: ComposerBreakpoint = getComposerBreakpoint(),
): number {
  if (compact) {
    return expanded ? COMPACT_POLAROID.expanded.width : COMPACT_POLAROID.normal.width;
  }
  const table = expanded ? POLAROID_WIDTHS.expanded : POLAROID_WIDTHS.normal;
  return table[bp];
}

export function getComposerPolaroidDefaultHeight(
  expanded: boolean,
  compact: boolean,
  bp: ComposerBreakpoint = getComposerBreakpoint(),
): number {
  if (compact) {
    return expanded ? COMPACT_POLAROID.expanded.height : COMPACT_POLAROID.normal.height;
  }
  const table = expanded ? POLAROID_DEFAULT_HEIGHTS.expanded : POLAROID_DEFAULT_HEIGHTS.normal;
  return table[bp];
}

export function computeRefImageFrameSize(
  naturalWidth: number,
  naturalHeight: number,
  expanded: boolean,
  compact: boolean,
  bp: ComposerBreakpoint = getComposerBreakpoint(),
): { width: number; height: number } {
  const baseWidth = getComposerPolaroidBaseWidth(expanded, compact, bp);
  const maxHeight = getComposerPolaroidDefaultHeight(expanded, compact, bp);

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: baseWidth, height: maxHeight };
  }

  const rawHeight = Math.round(baseWidth * (naturalHeight / naturalWidth));
  return {
    width: baseWidth,
    height: Math.max(MIN_REF_IMAGE_FRAME_HEIGHT, Math.min(rawHeight, maxHeight)),
  };
}

/** 画布式 Composer 输入区最大高度 (限制在144px~176px，超出后平滑滚动，防止拉得过长) */
export const densityComposerInputMaxH =
  'max-h-36 sm:max-h-40 md:max-h-44';

/** 画布式 Composer 工具条药丸（略高于默认） */
export const densityComposerPill =
  'h-10 sm:h-10 xl:h-11 text-xs sm:text-[13px] px-3 sm:px-3.5 xl:px-4';

/** 画布式 Composer 发送按钮尺寸 */
export const densityComposerSendBtn =
  'w-10 h-10 sm:w-10 sm:h-10 xl:w-11 xl:h-11';

/** 密度感知 Dock 圆角 */
export const densityDockRadius =
  'rounded-2xl sm:rounded-3xl xl:rounded-[28px]';

/** 密度感知主按钮（随 --ui-density 缩放内边距） */
export const densityBtn =
  'py-[calc(0.4375rem*var(--ui-density,1))] px-[calc(0.75rem*var(--ui-density,1))] text-xs font-bold';

/** 密度感知侧栏大按钮（采集/下一步等） */
export const densityBtnLg =
  'py-[calc(0.5rem*var(--ui-density,1))] xl:py-[calc(0.75rem*var(--ui-density,1))] text-xs font-bold';

/** 密度感知卡片角标 */
export const densityBadge =
  'px-1 py-0.5 @min-[140px]/card:px-1.5 @min-[140px]/card:py-1 @min-[180px]/card:px-2 @min-[180px]/card:py-1 text-[10px] @min-[180px]/card:text-[11px] font-bold';

/** 密度感知 section 内边距 */
export const densitySectionPad =
  'p-2.5 sm:p-3 lg:p-3.5 xl:p-4';

/** 滚动区底部留白（配合 --prompt-dock-h CSS 变量） */
export const dockSafeArea =
  'pb-[calc(var(--prompt-dock-h,16rem)+1.5rem)]';

/** 设置弹窗内容区内边距 */
/** 设置弹窗内容区内边距 */
export const settingsPanelPad =
  'p-4 sm:p-5 xl:p-6';

/** 设置弹窗外壳尺寸（现代宽屏桌面级比例，舒展透气） */
export const settingsModalShell =
  'w-full max-w-[min(94vw,940px)] 2xl:max-w-[min(94vw,980px)] h-[min(90dvh,82vh)] md:max-h-[min(84vh,660px)] rounded-3xl shadow-2xl overflow-hidden';

/** 设置弹窗容器查询根（控制三栏/两栏切换） */
export const settingsModalContainer = '@container/settings-modal';

/** 设置页触控按钮最小尺寸 */
export const settingsTouchBtn =
  'min-h-7.5 min-w-7.5 sm:min-h-8 sm:min-w-8';

/** 工作流模型能力药丸 */
export const settingsCapabilityPill =
  'min-h-7 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none';

/** compact 布局下缩小面板内边距 */
export const compactPanelPad =
  'p-3 sm:p-4 xl:p-5 compact:p-2.5 compact:sm:p-3.5';

/** compact 布局下工具条间距收紧 */
export const compactAwareToolbar =
  'flex flex-wrap items-center gap-2 min-w-0 compact:gap-1.5';

/** 设置弹窗左侧导航：现代图标导航栏宽度 */
export const settingsNavWidth =
  'w-40 @[720px]/settings-modal:w-44';

/** 设置弹窗导航文字 */
export const settingsNavLabel =
  'whitespace-nowrap text-xs';

/** 设置弹窗分组标题 */
export const settingsNavSectionTitle =
  'hidden';

/** 设置面板容器查询根 */
export const settingsPanelContainer = '@container/settings-panel';

/** Composer 容器查询根 */
export const composerContainer = '@container/composer';

/** compact 时拍立得参考图框尺寸 */
export const compactComposerPolaroidFrame =
  'compact:w-[66px] compact:h-[88px] compact:aspect-[3/4]';

/** compact 时拍立得参考图框（展开态） */
export const compactComposerPolaroidFrameExpanded =
  'compact:w-[74px] compact:h-[98px] compact:aspect-[3/4]';
