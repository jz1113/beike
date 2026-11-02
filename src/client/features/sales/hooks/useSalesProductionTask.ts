import { useCallback, useEffect, useRef, useState } from 'react';

type ProductionTask = 'adapt' | 'tts' | 'video' | 'mix' | 'upload';

/** Paid requests are single-flight; canceled or obsolete responses never become current output. */
export function useSalesProductionTask(contextKey: string) {
  const [busy, setBusy] = useState<'' | ProductionTask>('');
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState('');
  const active = useRef<{ controller: AbortController; contextKey: string } | null>(null);
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;

  const cancel = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
    setBusy('');
    setProgressText('');
  }, []);

  useEffect(() => {
    if (active.current && active.current.contextKey !== contextKey) {
      cancel();
      setError('商品或制作方案已更新，已停止等待旧任务；已提交的视频可到历史记录核对。');
    }
  }, [cancel, contextKey]);
  useEffect(() => () => {
    active.current?.controller.abort();
    active.current = null;
  }, []);

  const runTask = useCallback(async <T,>(
    kind: ProductionTask,
    label: string,
    fn: (signal: AbortSignal, onProgress: (text: string) => void) => Promise<T>,
  ): Promise<T | null> => {
    if (active.current) return null;
    const task = { controller: new AbortController(), contextKey: latestContext.current };
    active.current = task;
    const isCurrent = () => active.current === task && !task.controller.signal.aborted
      && latestContext.current === task.contextKey;
    setBusy(kind);
    setProgressText(label);
    setError('');
    try {
      const result = await fn(task.controller.signal, (text) => { if (isCurrent()) setProgressText(text); });
      return isCurrent() ? result : null;
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : '执行失败，请重试');
      return null;
    } finally {
      if (active.current === task) {
        active.current = null;
        setBusy('');
        setProgressText('');
      }
    }
  }, []);

  return { busy, progressText, error, setError, runTask, cancel };
}
