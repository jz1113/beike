// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSafeTimeout } from '../useSafeTimeout';

describe('useSafeTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('正常延迟触发 callback', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useSafeTimeout());

    act(() => {
      result.current.setSafeTimeout(callback, 1000);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('支持通过 clearSafeTimeout 手动取消特定定时器', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useSafeTimeout());

    let timerId: ReturnType<typeof setTimeout>;
    act(() => {
      timerId = result.current.setSafeTimeout(callback, 1000);
    });

    act(() => {
      vi.advanceTimersByTime(500);
      result.current.clearSafeTimeout(timerId);
      vi.advanceTimersByTime(600);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('组件卸载 (unmount) 时自动清除所有挂起的定时器', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { result, unmount } = renderHook(() => useSafeTimeout());

    act(() => {
      result.current.setSafeTimeout(cb1, 1000);
      result.current.setSafeTimeout(cb2, 2000);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();

    // 卸载组件
    unmount();

    // 时间流逝超过定时器设定
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // 确保组件卸载后回调绝对不会执行
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('支持 clearAllSafeTimeouts 一键清空所有活跃定时器', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { result } = renderHook(() => useSafeTimeout());

    act(() => {
      result.current.setSafeTimeout(cb1, 1000);
      result.current.setSafeTimeout(cb2, 2000);
    });

    act(() => {
      result.current.clearAllSafeTimeouts();
      vi.advanceTimersByTime(3000);
    });

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });
});
