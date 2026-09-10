import { describe, expect, it } from 'vitest';
import { computeRefImageFrameSize } from './layoutClasses';

describe('computeRefImageFrameSize', () => {
  it('shrinks height for landscape images', () => {
    const { width, height } = computeRefImageFrameSize(1920, 1080, false, false, 'md');
    expect(width).toBe(112);
    expect(height).toBe(63);
  });

  it('keeps portrait images near default max height', () => {
    const { width, height } = computeRefImageFrameSize(1080, 1920, false, false, 'md');
    expect(width).toBe(112);
    expect(height).toBe(148);
  });

  it('uses square dimensions for 1:1 images', () => {
    const { width, height } = computeRefImageFrameSize(1000, 1000, false, false, 'md');
    expect(width).toBe(112);
    expect(height).toBe(112);
  });

  it('clamps ultra-wide images to minimum height', () => {
    const { height } = computeRefImageFrameSize(4000, 200, false, false, 'md');
    expect(height).toBe(56);
  });

  it('uses compact dimensions when layout is compact', () => {
    const { width, height } = computeRefImageFrameSize(1920, 1080, false, true, 'md');
    expect(width).toBe(88);
    expect(height).toBe(56);
  });
});
