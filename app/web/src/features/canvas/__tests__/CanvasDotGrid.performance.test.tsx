import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CanvasDotGrid from '../components/CanvasDotGrid';
import { setPerformanceMode } from '@/lib/performancePreference';
afterEach(() => {cleanup(); localStorage.removeItem('zhuo_performance_mode'); vi.restoreAllMocks();});
it('tracks pan and zoom without running animation frames in balanced mode', () => {
  setPerformanceMode('balanced');
  const raf = vi.spyOn(window, 'requestAnimationFrame');
  const {container,rerender}=render(<CanvasDotGrid pan={{x:0,y:0}} zoom={1}/>);
  expect(container.querySelector('canvas')).toBeNull();
  expect(raf).not.toHaveBeenCalled();
  const before = (container.firstChild as HTMLElement).style.backgroundPosition;
  rerender(<CanvasDotGrid pan={{x:100,y:80}} zoom={0.5}/>);
  expect((container.firstChild as HTMLElement).style.backgroundPosition).not.toBe(before);
  expect((container.firstChild as HTMLElement).style.backgroundSize).toBe('15.5px 15.5px');
});
