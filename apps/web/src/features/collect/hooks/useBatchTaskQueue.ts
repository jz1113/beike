import { normalizeCollectedImages } from '../utils/normalizeCollectedImages';
import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { apiFetch } from '@/shared/api/apiClient';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { getExternalScraperCredentials } from '@/shared/utils/externalScraperCredentials';
import { parseSocialLinkWithRateLimit } from '@/shared/utils/xhsLinkBatch';
import { RateLimiter } from '@/shared/utils/rateLimiter';
import {
  type BatchTaskItem,
  detectPlatformFromText,
  extractUrlsFromRawText,
} from '../utils/collectorTypes';

interface UseBatchTaskQueueOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
}

export function useBatchTaskQueue({
  isOpen,
  showToast,
}: UseBatchTaskQueueOptions) {
  const [batchInputMode, setBatchInputMode] = useState<'text' | 'file'>('text');
  const [batchTextarea, setBatchTextarea] = useState('');
  const [batchTasks, setBatchTasks] = useState<BatchTaskItem[]>([]);
  const [batchConcurrency, setBatchConcurrency] = useState<number>(6);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchAbortedRef = useRef(false);
  const batchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socialRateLimiterRef = useRef(new RateLimiter(8.5));
  const aliveRef = useRef(true);
  const batchAbortControllerRef = useRef<AbortController | null>(null);

  const mergeAbortSignals = (...signals: Array<AbortSignal | undefined>) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    for (const signal of signals) {
      if (!signal) continue;
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    return controller.signal;
  };

  // 模态关闭时强制停止批量任务并 abort 进行中的请求
  useEffect(() => {
    if (!isOpen) {
      batchAbortedRef.current = true;
      batchAbortControllerRef.current?.abort();
      if (batchIntervalRef.current !== null) {
        clearInterval(batchIntervalRef.current);
        batchIntervalRef.current = null;
      }
      return;
    }
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      batchAbortedRef.current = true;
      batchAbortControllerRef.current?.abort();
    };
  }, [isOpen]);

  // 从粘贴文本添加任务
  const handleAddTasksFromText = () => {
    const urls = extractUrlsFromRawText(batchTextarea);
    if (urls.length === 0) {
      showToast('⚠️ 未从输入框中识别到有效链接或商品 ID');
      return;
    }

    const existingUrls = new Set(batchTasks.map((t) => t.url));
    const newItems: BatchTaskItem[] = [];

    const nextOrder = batchTasks.reduce((max, task) => Math.max(max, task.importOrder || 0), 0) + 1;
    urls.forEach((url, idx) => {
      if (!existingUrls.has(url)) {
        const plat = detectPlatformFromText(url);
        newItems.push({
          id: `task_${Date.now()}_${idx}`,
          url,
          platform: plat,
          status: 'pending',
          importOrder: nextOrder + idx,
        });
      }
    });

    if (newItems.length === 0) {
      showToast('ℹ️ 所输入的链接均已存在于任务列表中');
      return;
    }

    setBatchTasks((prev) => [...prev, ...newItems]);
    setBatchTextarea('');
    showToast(`✅ 成功添加 ${newItems.length} 个批量采集任务！`);
  };

  // 从文件 (CSV / TXT / Excel) 导入任务
  const processBatchUploadFile = async (file: File) => {
    try {
      const fileName = file.name.toLowerCase();
      let rawText = '';

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        try {
          const zip = await JSZip.loadAsync(file);
          const sharedStringsFile = zip.file('xl/sharedStrings.xml');
          if (sharedStringsFile) {
            rawText = await sharedStringsFile.async('text');
          }
          const sheetFiles = Object.keys(zip.files).filter((k) => k.startsWith('xl/worksheets/'));
          for (const sName of sheetFiles) {
            const sFile = zip.file(sName);
            if (sFile) {
              const sContent = await sFile.async('text');
              rawText += '\n' + sContent;
            }
          }
        } catch (excelErr) {
          console.warn('JSZip 解析 Excel 异常，回退为文本读取:', excelErr);
          rawText = await file.text();
        }
      } else {
        rawText = await file.text();
      }

      const urls = extractUrlsFromRawText(rawText);
      if (urls.length === 0) {
        showToast('⚠️ 未从上传的文件中扫描到商品或社媒链接');
        return;
      }

      const existingUrls = new Set(batchTasks.map((t) => t.url));
      const newItems: BatchTaskItem[] = [];

    const nextOrder = batchTasks.reduce((max, task) => Math.max(max, task.importOrder || 0), 0) + 1;
    urls.forEach((url, idx) => {
        if (!existingUrls.has(url)) {
          const plat = detectPlatformFromText(url);
          newItems.push({
            id: `task_file_${Date.now()}_${idx}`,
            url,
          platform: plat,
          status: 'pending',
          importOrder: nextOrder + idx,
          });
        }
      });

      if (newItems.length === 0) {
        showToast('ℹ️ 文件中的所有链接已在任务列表中');
        return;
      }

      setBatchTasks((prev) => [...prev, ...newItems]);
      showToast(`🎉 成功从文件「${file.name}」导入 ${newItems.length} 个采集任务！`);
    } catch (err: any) {
      showToast(`❌ 文件解析失败: ${formatUserError(err)}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await processBatchUploadFile(file);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 执行单条任务采集
  const executeSingleTask = async (task: BatchTaskItem): Promise<BatchTaskItem> => {
    if (batchAbortedRef.current) {
      return { ...task, status: 'failed', error: '已取消采集任务' };
    }
    const requestSignal = mergeAbortSignals(
      AbortSignal.timeout(30_000),
      batchAbortControllerRef.current?.signal,
    );
    try {
      if (task.platform === 'social') {
        const { scraperId, scraperSecret } = await getExternalScraperCredentials();
        if (batchAbortedRef.current) {
          return { ...task, status: 'failed', error: '已取消采集任务' };
        }
        const parsed = await parseSocialLinkWithRateLimit(
          task.url,
          scraperId,
          scraperSecret,
          socialRateLimiterRef.current,
        );
        if (batchAbortedRef.current) {
          return { ...task, status: 'failed', error: '已取消采集任务' };
        }
        if (parsed.success) {
          const result = parsed.data;
          const images = Array.isArray(result.images) ? result.images : [];
          const videos = Array.from(new Set([
            ...(Array.isArray(result.videos) ? result.videos : []),
            result.video,
          ].filter((url): url is string => typeof url === 'string' && Boolean(url))));

          return {
            ...task,
            status: 'success',
            title: result.title || '社媒爆款图集素材',
            coverImage: result.cover || images[0] || '',
            images: images,
            video: videos[0] || null,
            videos,
            author: result.author,
            time: new Date().toLocaleTimeString(),
          };
        } else {
          return {
            ...task,
            status: 'failed',
            error: parsed.error || '未能提取到图片内容',
          };
        }
      } else {
        // 电商商品批量采集
        const res = await apiFetch('/api/catalog/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: requestSignal,
          body: JSON.stringify({
            url: task.url,
            platform: task.platform,
            forceRefresh: true,
          }),
        });

        const data = await res.json();
        if (data.success && data.product) {
          const prod = data.product;
          const { mainImgs, skuImgs, descImgs, allImgs, coverImg } = normalizeCollectedImages(data);

          return {
            ...task,
            status: 'success',
            error: undefined,
            title: prod.title || '电商精选商品素材',
            coverImage: coverImg,
            images: allImgs,
            price: prod.price,
            time: new Date().toLocaleTimeString(),
          };
        } else {
          return {
            ...task,
            status: 'failed',
            error: data.error || '采集接口无响应',
          };
        }
      }
    } catch (err: any) {
      return {
        ...task,
        status: 'failed',
        error: formatUserError(err, '网络连接异常'),
      };
    }
  };

  const batchTasksRef = useRef(batchTasks);
  useEffect(() => {
    batchTasksRef.current = batchTasks;
  }, [batchTasks]);
  const claimMutexRef = useRef(Promise.resolve());

  const handleStartBatchTasks = async () => {
    const pendingTasks = batchTasksRef.current.filter(
      (t) => t.status === 'pending' || t.status === 'failed',
    );
    if (pendingTasks.length === 0) {
      showToast('ℹ️ 没有待执行或失败的任务');
      return;
    }

    setIsBatchRunning(true);
    batchAbortedRef.current = false;
    batchAbortControllerRef.current?.abort();
    batchAbortControllerRef.current = new AbortController();
    const CONCURRENCY = Math.max(1, Math.min(16, batchConcurrency || 6));
    showToast(`🚀 批量采集队列已启动（${CONCURRENCY} 并发），正在抓取 ${pendingTasks.length} 个任务...`);

    const claimNext = (): Promise<{ id: string; task: BatchTaskItem } | null> => {
      const job = claimMutexRef.current.then(() => {
        if (batchAbortedRef.current) return null;
        const prev = batchTasksRef.current;
        const idx = prev.findIndex((t) => t.status === 'pending' || t.status === 'failed');
        if (idx < 0) return null;
        const task = prev[idx];
        const next = prev.map((t, i) =>
          i === idx ? { ...t, status: 'running' as const } : t,
        );
        batchTasksRef.current = next;
        setBatchTasks(next);
        return { id: task.id, task: { ...task, status: 'running' as const } };
      });
      claimMutexRef.current = job.then(() => undefined).catch(() => undefined);
      return job;
    };

    const worker = async () => {
      while (!batchAbortedRef.current) {
        const claimed = await claimNext();
        if (!claimed) break;

        const updated = await executeSingleTask(claimed.task);
        if (!aliveRef.current) return;
        setBatchTasks((prev) => {
          const next = prev.map((t) => (t.id === claimed.id ? updated : t));
          batchTasksRef.current = next;
          return next;
        });
        await new Promise((r) => setTimeout(r, Math.max(150, Math.floor(600 / CONCURRENCY))));
      }
    };

    const workers = Array.from({ length: CONCURRENCY }).map(() => worker());
    await Promise.all(workers);

    if (batchIntervalRef.current !== null) {
      clearInterval(batchIntervalRef.current);
      batchIntervalRef.current = null;
    }

    if (aliveRef.current) setIsBatchRunning(false);
    if (!batchAbortedRef.current && aliveRef.current) {
      showToast('🎉 批量采集任务队列执行完毕！已自动沉淀入汇总库');
    }
  };

  const handlePauseBatchTasks = () => {
    batchAbortedRef.current = true;
    if (batchIntervalRef.current !== null) {
      clearInterval(batchIntervalRef.current);
      batchIntervalRef.current = null;
    }
    setIsBatchRunning(false);
    showToast('⏸ 已暂停批量采集任务');
  };

  const batchSuccessCount = batchTasks.filter((t) => t.status === 'success').length;
  const batchFailedCount = batchTasks.filter((t) => t.status === 'failed').length;
  const batchPendingCount = batchTasks.filter((t) => t.status === 'pending').length;
  const batchRunningCount = batchTasks.filter((t) => t.status === 'running').length;

  return {
    batchInputMode,
    setBatchInputMode,
    batchTextarea,
    setBatchTextarea,
    batchTasks,
    setBatchTasks,
    batchConcurrency,
    setBatchConcurrency,
    isBatchRunning,
    batchExporting,
    setBatchExporting,
    fileInputRef,
    handleAddTasksFromText,
    processBatchUploadFile,
    handleFileUpload,
    executeSingleTask,
    handleStartBatchTasks,
    handlePauseBatchTasks,
    batchSuccessCount,
    batchFailedCount,
    batchPendingCount,
    batchRunningCount,
  };
}
