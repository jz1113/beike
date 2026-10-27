import { describe, expect, it } from 'vitest';
import { fitShowcaseCanvas } from './showcaseCanvas';

const node = { id: 'n', type: 'image', x: 10000, y: -5000, width: 1200, height: 1600 };

describe('home canvas preview fitting', () => {
  it.each([[1200, 800], [320, 640]])('fits and centers distant or negative coordinates inside %i × %i', (width, height) => {
    const { zoom, pan } = fitShowcaseCanvas([node], width, height);
    const x = pan.x + node.x * zoom;
    const y = pan.y + node.y * zoom;
    expect(x).toBeGreaterThanOrEqual(31.99);
    expect(y).toBeGreaterThanOrEqual(31.99);
    expect(x + node.width * zoom).toBeLessThanOrEqual(width - 31.99);
    expect(y + node.height * zoom).toBeLessThanOrEqual(height - 31.99);
  });

  it('fits a large legacy canvas without a minimum zoom cropping its nodes', () => {
    const distant = { ...node, id: 'second', x: 1000000 };
    const view = fitShowcaseCanvas([node, distant], 800, 600);
    expect(view.zoom).toBeLessThan(0.001);
    expect(view.pan.x + (distant.x + distant.width) * view.zoom).toBeLessThanOrEqual(768.01);
    expect(fitShowcaseCanvas([], 800, 600)).toEqual({ zoom: 1, pan: { x: 400, y: 300 } });
  });
});
