// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import GlobalDynamicBackground from '../GlobalDynamicBackground';

// Mock DotGrid 隔离 canvas 渲染
vi.mock('../DotGrid', () => ({
  default: vi.fn(({ dotSize, gap, baseColor, activeColor }) => (
    <div
      data-testid="dot-grid"
      data-dotsize={dotSize}
      data-gap={gap}
      data-basecolor={baseColor}
      data-activecolor={activeColor}
    />
  )),
}));

describe('GlobalDynamicBackground 全局 DotGrid 交互点阵背景测试', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('全局渲染 DotGrid 交互式点阵网格，具备中性克制极简设计', () => {
    const { getByTestId } = render(
      <GlobalDynamicBackground currentView="home" />
    );

    const dotGrid = getByTestId('dot-grid');
    expect(dotGrid).toBeTruthy();
    expect(dotGrid.getAttribute('data-basecolor')).toBe('#CBD5E1');
    expect(dotGrid.getAttribute('data-activecolor')).toBe('#94A3B8');
    expect(dotGrid.getAttribute('data-gap')).toBe('28');
  });

  it('在不同路由视图下保持全站统一优雅点阵背景', () => {
    const { getByTestId } = render(
      <GlobalDynamicBackground currentView="generate" />
    );

    const dotGrid = getByTestId('dot-grid');
    expect(dotGrid).toBeTruthy();
  });
});
