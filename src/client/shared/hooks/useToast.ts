import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 全局 UI 时间常量（统一时长，避免魔法数字散落）
 */
export const TOAST_DURATION_MS = 2500;
export const COPY_FEEDBACK_DURATION_MS = 2000;
export const COPY_ICON_RESET_DURATION_MS = 1500;

export const POLL_INTERVAL_FAST_MS = 5000;
export const POLL_INTERVAL_SLOW_MS = 30_000;
export const PROBE_INTERVAL_FAST_MS = 5000;
export const PROBE_INTERVAL_SLOW_MS = 30_000;

export const SHORTCUT_REPEAT_GUARD_MS = 400;
export const PRELOAD_RELOAD_COOLDOWN_MS = 5000;
export const VITE_LAZY_RELOAD_COOLDOWN_MS = 10_000;

export const DEFAULT_DEBOUNCE_MS = 300;
export const SEARCH_DEBOUNCE_MS = 250;

export interface ToastController {
  message: string | null;
  show: (msg: string, duration?: number) => void;
  clear: () => void;
}

/**
 * 统一带自动清理的 toast hook。
 * - 组件卸载时自动清除未触发的定时器，避免在已卸载组件上调用 setState
 * - 重复调用 show 会自动取消前一个未完成的定时器
 * - duration 默认使用 TOAST_DURATION_MS，可按需覆盖
 */
export function useToast(defaultDuration: number = TOAST_DURATION_MS): ToastController {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  const show = useCallback(
    (msg: string, duration?: number) => {
      clearTimer();
      setMessage(msg);
      const ms = typeof duration === 'number' && duration > 0 ? duration : defaultDuration;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, ms);
    },
    [clearTimer, defaultDuration],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { message, show, clear };
}
