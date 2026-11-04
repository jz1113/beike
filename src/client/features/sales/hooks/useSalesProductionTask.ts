import { useCallback, useEffect, useRef, useState } from 'react';
import { SalesPromptRequestError } from '../api/salesPrompts';

type ProductionTask = 'adapt' | 'tts' | 'video' | 'mix' | 'upload';

function adaptationError(reason: string) {
  const detail = reason.trim().replace(/[。；;.]+$/u, '');
  const preserved = /(?:原分镜|原稿)[^。；\n]*已保留/u.test(detail);
  return `分镜改写失败：${detail}${preserved ? '。' : '；原分镜已保留，可重试。'}`;
}

/** Paid requests are single-flight; canceled or obsolete responses never become current output. */
export function useSalesProductionTask(contextKey: string) {
  const [busy, setBusy] = useState<'' | ProductionTask>('');
  const [progressText, setProgressText] = useState('');
  const [error, setErrorState] = useState('');
  const [errorPromptId, setErrorPromptId] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef<{ controller: AbortController; contextKey: string; kind: ProductionTask } | null>(null);
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;

  const setError = useCallback((message: string, promptId = '') => {
    setErrorState(message);
    setErrorPromptId(message ? promptId : '');
    if (message) setNotice('');
  }, []);
  const clearNotice = useCallback(() => setNotice(''), []);

  const cancel = useCallback(() => {
    if (active.current?.kind === 'adapt') setNotice('已停止分镜改写，原分镜已保留。');
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
  }, [cancel, contextKey, setError]);
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
    const task = { controller: new AbortController(), contextKey: latestContext.current, kind };
    active.current = task;
    const isCurrent = () => active.current === task && !task.controller.signal.aborted
      && latestContext.current === task.contextKey;
    setBusy(kind);
    setProgressText(label);
    setError('');
    setNotice('');
    try {
      const result = await fn(task.controller.signal, (text) => { if (isCurrent()) setProgressText(text); });
      if (!isCurrent()) return null;
      if (kind === 'adapt') setNotice('分镜改写成功，已更新本次分镜。');
      return result;
    } catch (err) {
      if (isCurrent()) {
        const reason = err instanceof Error ? err.message : '执行失败，请重试';
        setError(kind === 'adapt' ? adaptationError(reason) : reason, err instanceof SalesPromptRequestError ? err.promptId : '');
      }
      return null;
    } finally {
      if (active.current === task) {
        active.current = null;
        setBusy('');
        setProgressText('');
      }
    }
  }, [setError]);

  return { busy, progressText, error, errorPromptId, setError, notice, setNotice, clearNotice, runTask, cancel };
}
