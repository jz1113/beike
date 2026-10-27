import { describe, expect, it } from 'vitest';
import { visibleJustifiedRows } from './justifiedRows';
import { inspirationAspectRatio } from './inspirationMedia';

describe('home feed layout', () => {
  const gap = 8;
  const ratios = Array.from({ length: 35 }, (_, index) => [3 / 4, 9 / 16, 16 / 9][index % 3]);

  it.each([320, 768, 1200, 1900, 2560])('keeps existing rows and card geometry when loading more at width %i', width => {
    const geometry = (rows: number[][]) => rows.map(indices => {
      const height = (width - gap * (indices.length - 1)) / indices.reduce((sum, index) => sum + ratios[index], 0);
      return { indices, height, widths: indices.map(index => ratios[index] * height) };
    });
    const initial = geometry(visibleJustifiedRows(ratios, width, 10, gap));
    const more = geometry(visibleJustifiedRows(ratios, width, 20, gap));

    expect(more.slice(0, initial.length)).toEqual(initial);
    expect(initial.flatMap(row => row.indices).length).toBeGreaterThanOrEqual(10);
    for (const row of more) {
      expect(row.height).toBeGreaterThan(0);
      expect(row.widths.reduce((sum, value) => sum + value, gap * (row.indices.length - 1))).toBeCloseTo(width);
    }
  });

  it('renders each item once and completes the final row without a partial page', () => {
    const all = visibleJustifiedRows(ratios, 1900, ratios.length, gap);
    expect(all.flat()).toEqual(ratios.map((_, index) => index));
    expect(visibleJustifiedRows(ratios, 1900, all.at(-1)![0] + 1, gap)).toEqual(all);
    expect(visibleJustifiedRows([], 1900, 10, gap)).toEqual([]);
  });

  it('waits for a measured container width', () => {
    expect(visibleJustifiedRows(ratios, 0, 10, gap)).toEqual([]);
    expect(visibleJustifiedRows(ratios, Number.NaN, 10, gap)).toEqual([]);
  });

  it('reserves media ratios before decoding, with a stable fallback for published items', () => {
    expect(inspirationAspectRatio({ aspectRatio: '16:9' })).toBe('16 / 9');
    expect(inspirationAspectRatio({ aspectRatio: '9:16' })).toBe('9 / 16');
    for (const aspectRatio of [undefined, '', 'invalid', '0:4', 'Infinity:4']) {
      expect(inspirationAspectRatio({ aspectRatio })).toBe('3 / 4');
    }
  });
});
