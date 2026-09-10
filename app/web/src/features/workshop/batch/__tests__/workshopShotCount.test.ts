// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useWorkshopShotCount } from '../useWorkshopShotCount';

vi.mock('@beike/shared/prompt-engine/storyboardPreset', () => ({
  restoreStoredStoryboardPreset: () => ({ shotCount: 1 }),
}));
afterEach(() => { cleanup(); localStorage.removeItem('workshop_shot_count'); });

it('重新进入后恢复工坊分镜数，不被首页的 1 镜预设覆盖', () => {
  localStorage.removeItem('workshop_shot_count');
  const first = renderHook(() => useWorkshopShotCount());
  expect(first.result.current[0]).toBe(1);
  act(() => first.result.current[1](4));
  expect(localStorage.getItem('workshop_shot_count')).toBe('4');
  first.unmount();
  const reopened = renderHook(() => useWorkshopShotCount());
  expect(reopened.result.current[0]).toBe(4);
  act(() => reopened.result.current[1](8));
  reopened.unmount();
  expect(renderHook(() => useWorkshopShotCount()).result.current[0]).toBe(4);
});

it.each([2, 3, 5, 6, 7, 8])('旧的 %i 镜设置迁移为 4 镜并保存', (count) => {
  localStorage.setItem('workshop_shot_count', String(count));
  expect(renderHook(() => useWorkshopShotCount()).result.current[0]).toBe(4);
  expect(localStorage.getItem('workshop_shot_count')).toBe('4');
});
