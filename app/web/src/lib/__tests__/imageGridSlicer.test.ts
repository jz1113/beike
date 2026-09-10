import { describe, it, expect } from 'vitest';
import { detectGridDividerBounds } from '../imageGridSlicer';

describe('imageGridSlicer detectGridDividerBounds', () => {
  function createMockContext(
    width: number,
    height: number,
    pixelGenerator: (x: number, y: number) => [number, number, number, number]
  ): CanvasRenderingContext2D {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = pixelGenerator(x, y);
        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      }
    }

    return {
      getImageData: () => ({
        data,
        width,
        height,
      }),
    } as unknown as CanvasRenderingContext2D;
  }

  it('correctly handles seamless 2x2 grid without white borders', () => {
    const width = 1000;
    const height = 1000;
    const ctx = createMockContext(width, height, () => [120, 100, 90, 255]); // normal scene color

    const bounds = detectGridDividerBounds(ctx, width, height);
    expect(bounds.outerLeft).toBe(0);
    expect(bounds.outerTop).toBe(0);
    expect(bounds.outerRight).toBe(width);
    expect(bounds.outerBottom).toBe(height);
    expect(bounds.splitLeft).toBe(500);
    expect(bounds.splitRight).toBe(500);
    expect(bounds.splitTop).toBe(500);
    expect(bounds.splitBottom).toBe(500);
  });

  it('detects and trims vertical and horizontal white divider lines', () => {
    const width = 1000;
    const height = 1000;
    // Introduce a 10px white vertical stripe (x: 495..505) and 10px white horizontal stripe (y: 495..505)
    const ctx = createMockContext(width, height, (x, y) => {
      if ((x >= 495 && x <= 505) || (y >= 495 && y <= 505)) {
        return [255, 255, 255, 255]; // white divider line
      }
      return [100, 120, 140, 255]; // normal scene color
    });

    const bounds = detectGridDividerBounds(ctx, width, height);
    expect(bounds.splitLeft).toBeLessThanOrEqual(495);
    expect(bounds.splitRight).toBeGreaterThanOrEqual(505);
    expect(bounds.splitTop).toBeLessThanOrEqual(495);
    expect(bounds.splitBottom).toBeGreaterThanOrEqual(505);
  });

  it('detects and trims outer white border frame', () => {
    const width = 1000;
    const height = 1000;
    // 5px outer white border around entire perimeter
    const ctx = createMockContext(width, height, (x, y) => {
      if (x < 5 || x >= 995 || y < 5 || y >= 995) {
        return [255, 255, 255, 255]; // outer white border
      }
      return [100, 120, 140, 255];
    });

    const bounds = detectGridDividerBounds(ctx, width, height);
    expect(bounds.outerLeft).toBeGreaterThanOrEqual(5);
    expect(bounds.outerRight).toBeLessThanOrEqual(995);
    expect(bounds.outerTop).toBeGreaterThanOrEqual(5);
    expect(bounds.outerBottom).toBeLessThanOrEqual(995);
  });
});
