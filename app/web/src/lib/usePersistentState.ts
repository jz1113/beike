import { useState, useCallback } from 'react';

/**
 * 持久化数值 Hook
 * 读取 localStorage 中的整数，自动使用 fallback 与上下限 min/max 钳制；
 * 写入时自动钳制并同步写入 localStorage。
 */
export function usePersistentNumber(
  key: string,
  opts: {
    fallback: number;
    min?: number;
    max?: number;
  }
): [number, (n: number) => void] {
  const { fallback, min, max } = opts;

  const clamp = useCallback((val: number): number => {
    let result = Number(val);
    if (Number.isNaN(result)) result = fallback;
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
    return result;
  }, [fallback, min, max]);

  const [state, setState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed)) {
          if ((min === undefined || parsed >= min) && (max === undefined || parsed <= max)) {
            return parsed;
          }
        }
      }
    } catch {}
    return fallback;
  });

  const setPersistentState = useCallback((n: number) => {
    const clamped = clamp(n);
    setState(clamped);
    try {
      localStorage.setItem(key, String(clamped));
    } catch {}
  }, [key, clamp]);

  return [state, setPersistentState];
}

/**
 * 持久化枚举/字符串 Hook
 * 读取 localStorage 并通过 isValid 校验；写入时更新 state 与 localStorage。
 */
export function usePersistentEnum<T extends string>(
  key: string,
  opts: {
    fallback: T;
    isValid: (v: string) => v is T;
  }
): [T, (v: T) => void] {
  const { fallback, isValid } = opts;

  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null && isValid(saved)) {
        return saved;
      }
    } catch {}
    return fallback;
  });

  const setPersistentState = useCallback((val: T) => {
    setState(val);
    try {
      localStorage.setItem(key, val);
    } catch {}
  }, [key]);

  return [state, setPersistentState];
}
