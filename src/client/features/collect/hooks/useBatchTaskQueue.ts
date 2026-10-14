import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { getCollectorRateLimiter } from '../model/collectorRateLimiter';
import { type BatchTaskItem, detectPlatformFromText, extractUrlsFromRawText } from '../model/collectorTypes';
import { collectSourceMedia, type CollectedSourceItem } from '../api/collectSourceMedia';
import { readCollectorFile, type CollectorImportEntry } from '../model/collectorFileImport';
import { COLLECTOR_BATCH_LIMIT, collectorTaskIdentity } from '../model/collectorTaskIdentity';

interface UseBatchTaskQueueOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
  saveToCollectorHistory?: (item: CollectedSourceItem) => void;
}

export function useBatchTaskQueue({ isOpen, showToast, saveToCollectorHistory }: UseBatchTaskQueueOptions) {
  const [batchInputMode, setBatchInputMode] = useState<'text' | 'file'>('text');
  const [batchTextarea, setBatchTextarea] = useState('');
  const [batchTasks, setBatchTasksState] = useState<BatchTaskItem[]>([]);
  const [batchConcurrency, setBatchConcurrency] = useState(6);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchTasksRef = useRef<BatchTaskItem[]>([]);
  const activeRunRef = useRef<AbortController | null>(null);
  const taskControllersRef = useRef(new Map<string, AbortController>());
  const submittedTaskIdsRef = useRef(new Set<string>());
  const aliveRef = useRef(true);
  const importGenerationRef = useRef(0);
  const importControllersRef = useRef(new Set<AbortController>());
  const isOpenRef = useRef(isOpen);
  const socialRateLimiterRef = useRef(getCollectorRateLimiter());

  // Keep the queue snapshot synchronous so rapid imports, retries and claims cannot race a render.
  const setBatchTasks: Dispatch<SetStateAction<BatchTaskItem[]>> = useCallback((action) => {
    const previous = batchTasksRef.current;
    const next = typeof action === 'function' ? action(previous) : action;
    if (next.length === 0 && typeof action !== 'function') {
      importGenerationRef.current++;
      for (const controller of importControllersRef.current) controller.abort();
      importControllersRef.current.clear();
      setIsBatchImporting(false);
    }
    const retainedIds = new Set(next.map((task) => task.id));
    for (const task of previous) {
      if (!retainedIds.has(task.id) && !submittedTaskIdsRef.current.has(task.id)) taskControllersRef.current.get(task.id)?.abort();
    }
    batchTasksRef.current = next;
    setBatchTasksState(next);
  }, []);

  const stopTasks = useCallback(() => {
    activeRunRef.current?.abort();
    for (const [id, controller] of taskControllersRef.current) {
      if (!submittedTaskIdsRef.current.has(id)) controller.abort();
    }
    // Submitted requests finish once. The run guard remains held until they settle.
  }, []);

  const disposeRequests = useCallback(() => {
    aliveRef.current = false;
    isOpenRef.current = false;
    importGenerationRef.current++;
    for (const controller of importControllersRef.current) controller.abort();
    importControllersRef.current.clear();
    activeRunRef.current?.abort();
    for (const [id, controller] of taskControllersRef.current) {
      if (!submittedTaskIdsRef.current.has(id)) controller.abort();
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return disposeRequests;
  }, [disposeRequests]);
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      importGenerationRef.current++;
      for (const controller of importControllersRef.current) controller.abort();
      importControllersRef.current.clear();
      setIsBatchImporting(false);
      stopTasks();
    }
  }, [isOpen, stopTasks]);

  const appendEntries = (entries: CollectorImportEntry[]) => {
    const existing = new Set(batchTasksRef.current.map((task) => collectorTaskIdentity(task.url, task.platform)));
    let unsupported = 0, duplicates = 0, overLimit = 0;
    const additions: BatchTaskItem[] = [];
    const nextOrder = batchTasksRef.current.reduce((max, task) => Math.max(max, task.importOrder || 0), 0) + 1;
    for (const entry of entries) {
      if (entry.platform === 'auto' || (entry.platform === 'social' && /^\d+$/.test(entry.url))) {
        unsupported++;
        continue;
      }
      const key = collectorTaskIdentity(entry.url, entry.platform);
      if (existing.has(key)) { duplicates++; continue; }
      existing.add(key);
      if (batchTasksRef.current.length + additions.length >= COLLECTOR_BATCH_LIMIT) { overLimit++; continue; }
      additions.push({ ...entry, id: `task_${crypto.randomUUID()}`, status: 'pending', importOrder: nextOrder + additions.length });
    }
    if (additions.length) setBatchTasks((tasks) => [...tasks, ...additions]);
    return { added: additions.length, unsupported, duplicates, overLimit };
  };

  const importSummary = (result: ReturnType<typeof appendEntries>) => [
    result.duplicates ? `跳过 ${result.duplicates} 个重复商品或作品` : '',
    result.unsupported ? `跳过 ${result.unsupported} 个不支持的链接` : '',
    result.overLimit ? `队列上限 ${COLLECTOR_BATCH_LIMIT} 条，跳过 ${result.overLimit} 个超出容量的任务，请分批导入` : '',
  ].filter(Boolean).join('；');

  const handleAddTasksFromText = () => {
    const entries = extractUrlsFromRawText(batchTextarea).map((url) => ({ url, platform: detectPlatformFromText(url) }));
    if (!entries.length) { showToast('未识别到有效链接或商品 ID'); return; }
    const result = appendEntries(entries);
    if (result.added && !result.overLimit) setBatchTextarea('');
    showToast([result.added ? `已添加 ${result.added} 个采集任务` : '未添加任务', importSummary(result)].filter(Boolean).join('；'));
  };

  const cancelBatchImport = useCallback(() => {
    importGenerationRef.current++;
    for (const controller of importControllersRef.current) controller.abort();
    importControllersRef.current.clear();
    setIsBatchImporting(false);
  }, []);

  const processBatchUploadFile = async (file: File) => {
    if (!isOpenRef.current) return;
    const generation = importGenerationRef.current;
    const controller = new AbortController();
    importControllersRef.current.add(controller);
    setIsBatchImporting(true);
    try {
      const entries = await readCollectorFile(file, controller.signal);
      if (controller.signal.aborted || !isOpenRef.current || generation !== importGenerationRef.current) return;
      if (!entries.length) { showToast('文件中未识别到商品链接、ID 或社媒作品链接'); return; }
      const result = appendEntries(entries);
      showToast([result.added ? `已从「${file.name}」导入 ${result.added} 个任务` : '未导入任务', importSummary(result)].filter(Boolean).join('；'));
    } catch (error) {
      if (!controller.signal.aborted && isOpenRef.current && generation === importGenerationRef.current) showToast(`文件解析失败：${formatUserError(error)}`);
    } finally {
      importControllersRef.current.delete(controller);
      if (isOpenRef.current) setIsBatchImporting(importControllersRef.current.size > 0);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await processBatchUploadFile(file);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const executeTask = async (task: BatchTaskItem, runSignal?: AbortSignal): Promise<BatchTaskItem> => {
    const controller = new AbortController();
    const abortBeforeDispatch = () => {
      if (!submittedTaskIdsRef.current.has(task.id)) controller.abort();
    };
    runSignal?.addEventListener('abort', abortBeforeDispatch, { once: true });
    if (runSignal?.aborted) controller.abort();
    taskControllersRef.current.set(task.id, controller);
    setBatchTasks((tasks) => tasks.map((item) => item.id === task.id ? { ...item, status: 'running', error: undefined } : item));
    const isRetained = () => aliveRef.current
      && taskControllersRef.current.get(task.id) === controller
      && batchTasksRef.current.some((item) => item.id === task.id);
    let updated: BatchTaskItem = { ...task, status: 'pending', error: undefined };
    try {
      const result = await collectSourceMedia(task.url, task.platform, false, socialRateLimiterRef.current, controller.signal, {
        shouldStop: () => Boolean(runSignal?.aborted) || !isOpenRef.current || !aliveRef.current,
        onSubmitted: () => submittedTaskIdsRef.current.add(task.id),
      });
      if (!isRetained()) return updated;
      updated = { ...task, status: 'success', error: undefined, title: result.title, coverImage: result.coverImage,
        images: result.images, video: result.video, videos: result.videos, livePhotos: result.livePhotos,
        price: result.price, author: result.author, time: result.time };
      saveToCollectorHistory?.(result);
    } catch (error) {
      if (!isRetained()) return updated;
      if (submittedTaskIdsRef.current.has(task.id) || !controller.signal.aborted) {
        updated = { ...task, status: 'failed', error: formatUserError(error, '采集失败，请检查结果后再手动重试') };
      }
    } finally {
      runSignal?.removeEventListener('abort', abortBeforeDispatch);
      if (isRetained()) setBatchTasks((tasks) => tasks.map((item) => item.id === task.id ? updated : item));
      if (taskControllersRef.current.get(task.id) === controller) taskControllersRef.current.delete(task.id);
      submittedTaskIdsRef.current.delete(task.id);
    }
    return updated;
  };

  const executeSingleTask = async (task: BatchTaskItem): Promise<BatchTaskItem> => {
    const current = batchTasksRef.current.find((item) => item.id === task.id);
    if (!current || current.status === 'running' || activeRunRef.current || !isOpenRef.current) return current || task;
    return executeTask(current);
  };

  const handleStartBatchTasks = async () => {
    if (activeRunRef.current || taskControllersRef.current.size || !isOpenRef.current) return;
    // A run attempts each initial pending/failed item once. Failures require an explicit retry.
    const taskIds = batchTasksRef.current.filter((task) => task.status === 'pending' || task.status === 'failed').map((task) => task.id);
    if (!taskIds.length) {
      showToast('没有待执行或失败的任务');
      return;
    }
    const run = new AbortController();
    activeRunRef.current = run;
    setIsBatchRunning(true);
    const concurrency = Number.isFinite(batchConcurrency) ? Math.max(1, Math.min(16, Math.floor(batchConcurrency))) : 6;
    let cursor = 0;
    showToast(`批量采集已启动（${concurrency} 并发），本轮 ${taskIds.length} 个任务`);
    const worker = async () => {
      while (!run.signal.aborted && cursor < taskIds.length) {
        const id = taskIds[cursor++];
        const task = batchTasksRef.current.find((item) => item.id === id);
        if (!task || (task.status !== 'pending' && task.status !== 'failed')) continue;
        await executeTask(task, run.signal);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, taskIds.length) }, worker));
    if (activeRunRef.current !== run) return;
    activeRunRef.current = null;
    if (aliveRef.current) setIsBatchRunning(false);
    if (!aliveRef.current || !isOpenRef.current) return;
    if (run.signal.aborted) { showToast('已停止派发，已提交的采集任务已收尾保存'); return; }
    const failed = batchTasksRef.current.filter((task) => taskIds.includes(task.id) && task.status === 'failed').length;
    const pending = batchTasksRef.current.filter((task) => task.status === 'pending').length;
    showToast(`本轮采集完成${failed ? `，${failed} 项失败，可手动重试` : ''}${pending ? `；另有 ${pending} 项待执行` : ''}`);
  };

  const handlePauseBatchTasks = () => {
    stopTasks();
    showToast('已停止派发新任务，正在等待已提交的采集任务收尾');
  };

  return {
    batchInputMode, setBatchInputMode, batchTextarea, setBatchTextarea, batchTasks, setBatchTasks,
    batchConcurrency, setBatchConcurrency, isBatchRunning, batchExporting, setBatchExporting, fileInputRef,
    handleAddTasksFromText, processBatchUploadFile, handleFileUpload, executeSingleTask, isBatchImporting, cancelBatchImport,
    handleStartBatchTasks, handlePauseBatchTasks,
    batchSuccessCount: batchTasks.filter((task) => task.status === 'success').length,
    batchFailedCount: batchTasks.filter((task) => task.status === 'failed').length,
    batchPendingCount: batchTasks.filter((task) => task.status === 'pending').length,
    batchRunningCount: batchTasks.filter((task) => task.status === 'running').length,
  };
}
