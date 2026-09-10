import { useState, useEffect, useRef, useCallback } from 'react';

const TOAST_DURATION_MS = 2800;

/**
 * 采集模块专用 Toast hook。
 * 统一管理 Toast 消息的显示，自动清理 setTimeout，避免组件卸载后仍触发 setState。
 */
export function useCollectorToast() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    // 清除上一个定时器，避免重复触发
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToastMsg(msg);
    timerRef.current = setTimeout(() => {
      setToastMsg(null);
      timerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  // 组件卸载时统一清理
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { toastMsg, showToast };
}
