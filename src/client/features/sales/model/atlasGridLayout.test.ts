import { describe, expect, it } from 'vitest';
import { ATLAS_GRID_GAP, atlasGridLayout } from './atlasGridLayout';

describe('responsive atlas rows', () => {
  it.each([1084, 1100])('shows six compact cards in a %spx desktop drawer', (width) => {
    expect(atlasGridLayout(width, 'sm').columns).toBe(6);
  });

  it('reduces the column count at larger card sizes', () => {
    expect(atlasGridLayout(1100, 'md').columns).toBe(4);
    expect(atlasGridLayout(1100, 'lg').columns).toBe(3);
  });

  it.each([
    { deviceWidth: 360, viewportWidth: 316 },
    { deviceWidth: 390, viewportWidth: 346 },
  ])('fits two compact cards on a $deviceWidth px phone', ({ viewportWidth }) => {
    const layout = atlasGridLayout(viewportWidth, 'sm');
    expect(layout.columns).toBe(2);
    expect(layout.cardWidth).toBeGreaterThanOrEqual(148);
    expect(layout.cardWidth).toBeLessThanOrEqual(168);
  });

  it.each(['sm', 'md', 'lg'] as const)('keeps a readable single %s card in a narrow drawer', (density) => {
    expect(atlasGridLayout(140, density)).toEqual(expect.objectContaining({ columns: 1, cardWidth: 140 }));
    expect(atlasGridLayout(0, density).columns).toBe(1);
    expect(atlasGridLayout(Number.NaN, density).columns).toBe(1);
  });

  it.each([180, 340, 540, 780, 1100])('fits cards and gutters into a %spx viewport', (width) => {
    const layout = atlasGridLayout(width, 'sm');
    expect(layout.cardWidth * layout.columns + ATLAS_GRID_GAP * (layout.columns - 1)).toBeCloseTo(width);
    expect(layout.cardWidth).toBeGreaterThan(0);
    expect(layout.estimatedRowHeight).toBeGreaterThan(layout.cardWidth * 4 / 3);
  });

  it('updates the row estimate when the same column count has wider cards', () => {
    const narrow = atlasGridLayout(1000, 'md');
    const wider = atlasGridLayout(1100, 'md');
    expect(narrow.columns).toBe(wider.columns);
    expect(wider.estimatedRowHeight).toBeGreaterThan(narrow.estimatedRowHeight);
  });
});
