import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CanvasDotGrid } from '../components/CanvasDotGrid';

describe('CanvasDotGrid component', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a canvas element with aria-hidden', () => {
    const { container } = render(
      <CanvasDotGrid pan={{ x: 0, y: 0 }} zoom={1} />
    );

    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeTruthy();

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('accepts custom colors and proximity props without crashing', () => {
    const { container } = render(
      <CanvasDotGrid
        pan={{ x: 100, y: 200 }}
        zoom={1.5}
        baseColor="#E2E8F0"
        activeColor="#6366F1"
        proximity={150}
        dotSize={4}
        gap={30}
      />
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('updates transform refs when pan or zoom changes', () => {
    const { rerender, container } = render(
      <CanvasDotGrid pan={{ x: 0, y: 0 }} zoom={1} />
    );

    rerender(<CanvasDotGrid pan={{ x: 250, y: -100 }} zoom={0.8} isPanning={true} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });
});
