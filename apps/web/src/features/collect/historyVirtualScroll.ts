/**
 * 历史汇总库虚拟滚动纯逻辑辅助函数
 * 与 CollectorHistoryPanel 配套使用，便于单元测试
 */

/** 容器断点（与 Tailwind 的 sm/md 一致） */
export const HISTORY_GRID_BREAKPOINTS = { sm: 640, md: 768 } as const;

/** 每个行项的高度（像素），必须与 CSS 实际高度一致 */
export const HISTORY_ROW_HEIGHT = 140;

/** 行间距（对应 Tailwind gap-4 = 16px） */
export const HISTORY_ROW_GAP = 16;

/**
 * 根据容器宽度计算列数。
 * - < 640px : 1 列
 * - < 768px : 2 列
 * - >= 768px : 3 列
 */
export function computeHistoryColumnCount(containerWidth: number): 1 | 2 | 3 {
  if (containerWidth >= HISTORY_GRID_BREAKPOINTS.md) return 3;
  if (containerWidth >= HISTORY_GRID_BREAKPOINTS.sm) return 2;
  return 1;
}

/**
 * 将一维列表按列数切分为二维行数组。
 * 用于虚拟滚动以"行"为单位渲染网格。
 */
export function groupHistoryIntoRows<T>(items: readonly T[], columnCount: number): T[][] {
  const cols = Math.max(1, Math.floor(columnCount) || 1);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols));
  }
  return rows;
}

/**
 * 计算虚拟滚动容器需要的总高度。
 * 末行不需要底部间距，因此总高度 = rows.length * rowHeight + (rows.length - 1) * gap
 */
export function computeHistoryTotalHeight(rowCount: number, rowHeight = HISTORY_ROW_HEIGHT, rowGap = HISTORY_ROW_GAP): number {
  if (rowCount <= 0) return 0;
  return rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap;
}

/**
 * 计算给定行索引对应的垂直偏移（Y 坐标）。
 */
export function computeHistoryRowOffset(rowIndex: number, rowHeight = HISTORY_ROW_HEIGHT, rowGap = HISTORY_ROW_GAP): number {
  return Math.max(0, rowIndex) * (rowHeight + rowGap);
}
