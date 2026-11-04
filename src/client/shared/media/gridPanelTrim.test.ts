import { describe, expect, it } from 'vitest';
import { findGridSceneSplit, innerDividerTrim } from './gridPanelTrim';

function strip(bands: Array<[number, number]>, rows = 40): ImageData {
  const width = 80, height = 40;
  const data = new Uint8ClampedArray(width * height * 4).fill(90);
  for (const [from, to] of bands) {
    for (let y = 0; y < rows; y++) data.fill(255, (y * width + from) * 4, (y * width + to) * 4);
  }
  return { width, height, data } as ImageData;
}

describe('inner divider crop', () => {
  it('removes only the outside sliver of a panel', () => {
    expect(innerDividerTrim(strip([[21, 24]]), 'right')).toBe(61);
    expect(innerDividerTrim(strip([[21, 24]]), 'left')).toBe(26);
  });

  it('keeps partial edges, broad highlights and ambiguous layouts intact', () => {
    expect(innerDividerTrim(strip([[21, 24]], 30), 'right')).toBe(0);
    expect(innerDividerTrim(strip([[12, 24]]), 'right')).toBe(0);
    expect(innerDividerTrim(strip([[12, 15], [35, 38]]), 'right')).toBe(0);
  });
});

it('finds an off-center scene boundary shared by both columns', () => {
  const width = 100, height = 200;
  const data = new Uint8ClampedArray(width * height * 4).fill(35);
  data.fill(180, 108 * width * 4);
  const frame = { data, width, height } as ImageData;
  expect(findGridSceneSplit(frame, 'y')).toBeCloseTo(108, -1);
  expect(findGridSceneSplit(frame, 'x')).toBeUndefined();
  for (let y = 108; y < height; y++) data.fill(35, y * width * 4, (y * width + width / 2) * 4);
  expect(findGridSceneSplit(frame, 'y')).toBeUndefined();
});
