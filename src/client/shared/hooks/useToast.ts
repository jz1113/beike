import { useCallback, useEffect, useRef, useState } from 'react';
import { TOAST_DURATION_MS } from '@client/shared/constants/timing';

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
