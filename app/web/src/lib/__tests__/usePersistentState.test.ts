// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentNumber, usePersistentEnum } from '../usePersistentState';

describe('usePersistentNumber', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('使用默认 fallback 值初始化（当 localStorage 为空）', () => {
    const { result } = renderHook(() =>
      usePersistentNumber('test_concurrency', { fallback: 2, min: 1, max: 6 })
    );
    expect(result.current[0]).toBe(2);
  });

  it('成功从 localStorage 恢复存储值并受范围限制', () => {
    localStorage.setItem('test_concurrency', '4');
    const { result } = renderHook(() =>
      usePersistentNumber('test_concurrency', { fallback: 2, min: 1, max: 6 })
    );
    expect(result.current[0]).toBe(4);
  });

  it('越界或非法数值回退到 fallback', () => {
    localStorage.setItem('test_concurrency', '999'); // 超过 max: 6
    const { result: r1 } = renderHook(() =>
      usePersistentNumber('test_concurrency', { fallback: 2, min: 1, max: 6 })
    );
    expect(r1.current[0]).toBe(2);

    localStorage.setItem('test_concurrency', 'invalid_number');
    const { result: r2 } = renderHook(() =>
      usePersistentNumber('test_concurrency', { fallback: 2, min: 1, max: 6 })
    );
    expect(r2.current[0]).toBe(2);
  });

  it('setter 会自动钳制并写入 localStorage', () => {
    const { result } = renderHook(() =>
      usePersistentNumber('test_concurrency', { fallback: 2, min: 1, max: 6 })
    );

    act(() => {
      result.current[1](10); // 应该被钳制为 6
    });
    expect(result.current[0]).toBe(6);
    expect(localStorage.getItem('test_concurrency')).toBe('6');

    act(() => {
      result.current[1](-5); // 应该被钳制为 1
    });
    expect(result.current[0]).toBe(1);
    expect(localStorage.getItem('test_concurrency')).toBe('1');
  });
});

describe('usePersistentEnum', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  type Mode = 'grid_first' | 'single_shot';
  const isValidMode = (v: string): v is Mode => v === 'grid_first' || v === 'single_shot';

  it('正确加载并校验枚举值，非法值使用 fallback', () => {
    localStorage.setItem('test_strategy', 'single_shot');
    const { result: r1 } = renderHook(() =>
      usePersistentEnum<Mode>('test_strategy', {
        fallback: 'grid_first',
        isValid: isValidMode,
      })
    );
    expect(r1.current[0]).toBe('single_shot');

    localStorage.setItem('test_strategy', 'unknown_mode');
    const { result: r2 } = renderHook(() =>
      usePersistentEnum<Mode>('test_strategy', {
        fallback: 'grid_first',
        isValid: isValidMode,
      })
    );
    expect(r2.current[0]).toBe('grid_first');
  });

  it('setter 正确更新状态并写入 localStorage', () => {
    const { result } = renderHook(() =>
      usePersistentEnum<Mode>('test_strategy', {
        fallback: 'grid_first',
        isValid: isValidMode,
      })
    );

    act(() => {
      result.current[1]('single_shot');
    });
    expect(result.current[0]).toBe('single_shot');
    expect(localStorage.getItem('test_strategy')).toBe('single_shot');
  });
});
