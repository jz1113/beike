import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type SafeTimerId = ReturnType<typeof setTimeout>;

export interface SafeTimeoutController {
  /**
   * 设置一个安全的定时器，组件卸载时会自动清除。
   * 当定时器触发完毕后，会自动从活跃列表中移除。
   */
  setSafeTimeout: (callback: () => void, delayMs: number) => SafeTimerId;
  /**
   * 清除指定定时器
   */
  clearSafeTimeout: (timerId: SafeTimerId | null | undefined) => void;
  /**
   * 清除当前 Hook 记录的所有未触发定时器
   */
  clearAllSafeTimeouts: () => void;
}

/**
 * 安全的事件驱动型 setTimeout 管理 Hook。
 * 针对用户交互触发的延迟动作（如 Toast 自动关闭、复制状态自动还原、防抖延迟等），
 * 在组件卸载时自动调用 clearTimeout，彻底杜绝 unmounted 组件状态更新引发的内存泄漏。
 */
export function useSafeTimeout(): SafeTimeoutController {
  const timersRef = useRef<Set<SafeTimerId>>(new Set());

  const clearSafeTimeout = useCallback((timerId: SafeTimerId | null | undefined) => {
    if (!timerId) return;
    clearTimeout(timerId);
    timersRef.current.delete(timerId);
  }, []);

  const clearAllSafeTimeouts = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current.clear();
  }, []);

  const setSafeTimeout = useCallback(
    (callback: () => void, delayMs: number): SafeTimerId => {
      const timerId: SafeTimerId = setTimeout(() => {
        timersRef.current.delete(timerId);
        callback();
      }, delayMs);
      timersRef.current.add(timerId);
      return timerId;
    },
    [],
  );

  // 组件卸载时自动清理所有活跃定时器
  useEffect(() => {
    return () => {
      clearAllSafeTimeouts();
    };
  }, [clearAllSafeTimeouts]);

  return {
    setSafeTimeout,
    clearSafeTimeout,
    clearAllSafeTimeouts,
  };
}

export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
  return hidden;
}

/**
 * Lock scroll on a target container (by CSS selector) when `locked` is true.
 * Restores previous `overflow` value on unlock/unmount.
 */
export function useScrollLock(locked: boolean, selector: string) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;

    const prevOverflow = el.style.overflow;
    el.style.overflow = 'hidden';

    return () => {
      el.style.overflow = prevOverflow;
    };
  }, [locked, selector]);
}

export const ViewVisibilityContext = createContext(true);

/** Hidden keep-alive views retain their state but suspend foreground interactions. */
export function useViewVisibility() {
  return useContext(ViewVisibilityContext);
}
