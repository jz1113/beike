import { describe, it, expect } from 'vitest';
import {
  HISTORY_GRID_BREAKPOINTS,
  HISTORY_ROW_HEIGHT,
  HISTORY_ROW_GAP,
  computeHistoryColumnCount,
  groupHistoryIntoRows,
  computeHistoryTotalHeight,
  computeHistoryRowOffset,
} from '../historyVirtualScroll';

describe('computeHistoryColumnCount', () => {
  it('returns 1 column below sm breakpoint', () => {
    expect(computeHistoryColumnCount(0)).toBe(1);
    expect(computeHistoryColumnCount(320)).toBe(1);
    expect(computeHistoryColumnCount(639)).toBe(1);
  });

  it('returns 2 columns at sm breakpoint and above but below md', () => {
    expect(computeHistoryColumnCount(HISTORY_GRID_BREAKPOINTS.sm)).toBe(2);
    expect(computeHistoryColumnCount(700)).toBe(2);
    expect(computeHistoryColumnCount(767)).toBe(2);
  });

  it('returns 3 columns at md breakpoint and above', () => {
    expect(computeHistoryColumnCount(HISTORY_GRID_BREAKPOINTS.md)).toBe(3);
    expect(computeHistoryColumnCount(1024)).toBe(3);
    expect(computeHistoryColumnCount(1920)).toBe(3);
  });

  it('matches Tailwind sm/md breakpoint values', () => {
    // Tailwind default sm = 640px, md = 768px
    expect(HISTORY_GRID_BREAKPOINTS.sm).toBe(640);
    expect(HISTORY_GRID_BREAKPOINTS.md).toBe(768);
  });
});

describe('groupHistoryIntoRows', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('returns empty array for empty input', () => {
    expect(groupHistoryIntoRows([], 3)).toEqual([]);
  });

  it('groups items into rows of specified column count', () => {
    expect(groupHistoryIntoRows(items, 3)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g'],
    ]);
  });

  it('handles exact multiples', () => {
    expect(groupHistoryIntoRows(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles single column', () => {
    expect(groupHistoryIntoRows(['a', 'b', 'c'], 1)).toEqual([
      ['a'], ['b'], ['c'],
    ]);
  });

  it('coerces invalid columnCount to at least 1', () => {
    expect(groupHistoryIntoRows(['a', 'b', 'c'], 0)).toEqual([
      ['a'], ['b'], ['c'],
    ]);
    expect(groupHistoryIntoRows(['a', 'b'], -1)).toEqual([
      ['a'], ['b'],
    ]);
  });

  it('floats fractional columnCount', () => {
    expect(groupHistoryIntoRows(['a', 'b', 'c', 'd', 'e'], 2.5)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });

  it('does not mutate the original array', () => {
    const original = [...items];
    groupHistoryIntoRows(items, 3);
    expect(items).toEqual(original);
  });
});

describe('computeHistoryTotalHeight', () => {
  it('returns 0 for empty rows', () => {
    expect(computeHistoryTotalHeight(0)).toBe(0);
  });

  it('returns rowHeight for a single row (no trailing gap)', () => {
    expect(computeHistoryTotalHeight(1)).toBe(HISTORY_ROW_HEIGHT);
  });

  it('adds gap between rows but not after the last row', () => {
    // 3 行: 3 * height + 2 * gap
    const expected = 3 * HISTORY_ROW_HEIGHT + 2 * HISTORY_ROW_GAP;
    expect(computeHistoryTotalHeight(3)).toBe(expected);
  });

  it('uses custom dimensions when provided', () => {
    expect(computeHistoryTotalHeight(2, 100, 10)).toBe(210); // 2*100 + 1*10
    expect(computeHistoryTotalHeight(5, 200, 0)).toBe(1000);
  });

  it('handles large row counts without overflow', () => {
    // 1000 行
    const expected = 1000 * HISTORY_ROW_HEIGHT + 999 * HISTORY_ROW_GAP;
    expect(computeHistoryTotalHeight(1000)).toBe(expected);
  });
});

describe('computeHistoryRowOffset', () => {
  it('returns 0 for the first row', () => {
    expect(computeHistoryRowOffset(0)).toBe(0);
  });

  it('returns rowHeight + gap for the second row', () => {
    expect(computeHistoryRowOffset(1)).toBe(HISTORY_ROW_HEIGHT + HISTORY_ROW_GAP);
  });

  it('respects custom dimensions', () => {
    expect(computeHistoryRowOffset(2, 100, 10)).toBe(220); // 2 * (100+10)
  });

  it('returns 0 for negative indices', () => {
    expect(computeHistoryRowOffset(-1)).toBe(0);
    expect(computeHistoryRowOffset(-100)).toBe(0);
  });

  it('produces monotonically increasing offsets', () => {
    const offsets = [0, 1, 2, 3, 10, 50].map((i) => computeHistoryRowOffset(i));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });
});

describe('virtual scroll integration', () => {
  it('total height equals last row offset + last row height', () => {
    const rowCount = 7;
    const totalHeight = computeHistoryTotalHeight(rowCount);
    const lastRowOffset = computeHistoryRowOffset(rowCount - 1);
    expect(totalHeight).toBe(lastRowOffset + HISTORY_ROW_HEIGHT);
  });

  it('row offsets are bounded by total height', () => {
    const rowCount = 5;
    const totalHeight = computeHistoryTotalHeight(rowCount);
    for (let i = 0; i < rowCount; i++) {
      const offset = computeHistoryRowOffset(i);
      // offset + rowHeight <= totalHeight
      expect(offset + HISTORY_ROW_HEIGHT).toBeLessThanOrEqual(totalHeight);
    }
  });

  it('row grouping produces correct count for each column count', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    // 1 列：100 行
    expect(groupHistoryIntoRows(items, 1)).toHaveLength(100);
    // 2 列：50 行
    expect(groupHistoryIntoRows(items, 2)).toHaveLength(50);
    // 3 列：34 行（最后一行为 1 项）
    expect(groupHistoryIntoRows(items, 3)).toHaveLength(34);
    // 4 列：25 行
    expect(groupHistoryIntoRows(items, 4)).toHaveLength(25);
  });
});
