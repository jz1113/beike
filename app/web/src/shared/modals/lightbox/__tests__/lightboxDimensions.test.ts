import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from '../lightboxDimensions';

describe('calculateTargetDimensions', () => {
  it('在 1:1 比例下根据画质正确计算像素尺寸', () => {
    expect(calculateTargetDimensions('1:1', 'high')).toBe('2048x2048');
    expect(calculateTargetDimensions('1:1', 'medium')).toBe('1536x1536');
    expect(calculateTargetDimensions('1:1', 'low')).toBe('1024x1024');
  });

  it('在 3:4 比例下根据画质正确计算像素尺寸', () => {
    expect(calculateTargetDimensions('3:4', 'high')).toBe('2448x3264');
    expect(calculateTargetDimensions('3:4', 'medium')).toBe('1728x2304');
    expect(calculateTargetDimensions('3:4', 'low')).toBe('1024x1365');
  });

  it('在 16:9 比例下根据画质正确计算像素尺寸', () => {
    expect(calculateTargetDimensions('16:9', 'high')).toBe('3264x1836');
    expect(calculateTargetDimensions('16:9', 'medium')).toBe('2560x1440');
    expect(calculateTargetDimensions('16:9', 'low')).toBe('1820x1024');
  });

  it('在 smart 智能比例下回退为 3:4 像素尺寸', () => {
    expect(calculateTargetDimensions('smart', 'high')).toBe('2448x3264');
    expect(calculateTargetDimensions('smart', 'low')).toBe('1024x1365');
  });
});
