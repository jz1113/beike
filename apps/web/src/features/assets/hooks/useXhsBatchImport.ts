import { useState, useCallback } from 'react';
import { mapWithConcurrency } from '@beike/domain/asyncPool';
import { apiFetch } from '@/shared/api/apiClient';
import { getExternalScraperCredentials } from '@/shared/utils/externalScraperCredentials';
import {
  batchParseXhsLinks,
  fetchParseLinkWithRateLimit,
  filterParseLinkImages,
  parseXhsUrlsFromText,
  toXhsQueueItem,
} from '@/shared/utils/xhsLinkBatch';
import { processDeconstructQueueItem } from '@/shared/api/deconstructClient';
import { RateLimiter } from '@/shared/utils/rateLimiter';
import {
  exportDeconstructRecordsToCsv,
  transformQueueItemToRecordRow,
} from '../utils/assetDeconstructCsvExport';
import type { ImageSetQueueItem } from '../utils/assetPromptConstants';
import type { DeconstructQueueApi } from './useDeconstructQueue';
import { mergeParsedQueueItems, selectFreshSourceUrls, type CollectionIssue } from './xhsSourceCheck';

export type UseXhsBatchImportOptions = {
  queueApi: DeconstructQueueApi;
  showToast: (msg: string) => void;
  onRefreshAssets: () => void;
};

export function useXhsBatchImport({ queueApi, showToast, onRefreshAssets }: UseXhsBatchImportOptions) {
  const [deconstructSourceMode, setDeconstructSourceMode] = useState<'local' | 'xhs'>('xhs');
  const [xhsLinksInput, setXhsLinksInput] = useState('');
  const [isParsingXhsLinks, setIsParsingXhsLinks] = useState(false);
  const [collectionIssues, setCollectionIssues] = useState<CollectionIssue[]>([]);
  const [xhsParseProgress, setXhsParseProgress] = useState<{
    current: number;
    total: number;
    success: number;
    skipped: number;
  } | null>(null);

  const {
    queue,
    setQueue,
    setCurrentQueueIndex,
    userHint,
    selectedVisionModel,
    multimodalModels,
    queueConcurrency,
    isDeconstructingRef,
    setIsDeconstructing,
    setProcessingQueueCount,
    setLastExportedCsvFilename,
    setDeconstructRecordRows,
  } = queueApi;

  const handleBatchParseXhsLinks = useCallback(async () => {
    const rawText = xhsLinksInput.trim();
    if (!rawText) {
      showToast('请先输入或粘贴小红书笔记链接');
      return;
    }

    setIsParsingXhsLinks(true);
    setXhsParseProgress({ current: 0, total: 0, success: 0, skipped: 0 });
    setCollectionIssues([]);

    try {
      const candidateUrls = parseXhsUrlsFromText(rawText);
      const checkRes = await apiFetch('/api/catalog/assets/source-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: candidateUrls }),
      });
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok || checkData.success === false) {
        showToast(checkData.error || '查重服务暂不可用，请稍后重试');
        return;
      }
      const { urls, issues } = selectFreshSourceUrls(Array.isArray(checkData.data) ? checkData.data : [], queue);
      setCollectionIssues(issues);
      if (urls.length === 0) {
        showToast(issues.length > 0 ? '所选链接均已在资产库或队列中' : '未采编到符合条件的图集');
        return;
      }

      const { scraperId, scraperSecret } = await getExternalScraperCredentials();
      const { queueItems, skipped } = await batchParseXhsLinks(urls.join('\n'), scraperId, scraperSecret, {
        onProgress: (progress) => setXhsParseProgress({
          current: progress.current,
          total: progress.total,
          success: progress.success,
          skipped: progress.skipped ?? 0,
        }),
      });

      if (queueItems.length > 0) {
        setQueue(mergeParsedQueueItems(queue, queueItems));
        setXhsLinksInput('');
        showToast(
          `成功采编 ${queueItems.length} 套图集（每套截取前 10 张图加入队列），跳过 ${skipped.length} 套（纯视频或不足3图）`
        );
      } else {
        showToast(`未采编到符合条件的图集（跳过 ${skipped.length} 套：纯视频或不足3图）`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`批量采编异常: ${message}`);
    } finally {
      setIsParsingXhsLinks(false);
      setXhsParseProgress(null);
    }
  }, [xhsLinksInput, queue, setQueue, showToast]);

  const runFullPipelineClosedLoop = useCallback(async () => {
    const rawText = xhsLinksInput.trim();
    if (!rawText) {
      showToast('请先输入或粘贴小红书笔记链接');
      return;
    }

    if (isDeconstructingRef.current || isParsingXhsLinks) return;

    const modelIds = multimodalModels.map((m) => m.id).filter(Boolean);
    if (modelIds.length === 0) {
      showToast('请先在设置 → 服务接口配置中启用多模态模型');
      return;
    }

    const candidateUrls = parseXhsUrlsFromText(rawText);
    if (candidateUrls.length === 0) {
      showToast('未识别到有效的小红书笔记链接');
      return;
    }

    isDeconstructingRef.current = true;
    setIsDeconstructing(true);
    setIsParsingXhsLinks(true);
    setXhsParseProgress({ current: 0, total: candidateUrls.length, success: 0, skipped: 0 });

    let producerFinished = false;
    const localQueue: ImageSetQueueItem[] = [...queue];
    const deconstructWorkQueue: number[] = [];
    const rateLimiter = new RateLimiter(8.5);

    let doneCount = 0;
    let partialCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let activeDeconstructWorkers = 0;

    const syncPipelineQueue = (activeIdx = -1) => {
      setQueue([...localQueue]);
      if (activeIdx >= 0) setCurrentQueueIndex(activeIdx);
    };

    const executeDeconstructItem = async (idx: number) => {
      const targetItem = localQueue[idx];
      if (!targetItem) return;

      activeDeconstructWorkers++;
      setProcessingQueueCount(activeDeconstructWorkers);
      localQueue[idx] = { ...localQueue[idx], status: 'processing', error: undefined };
      syncPipelineQueue(idx);

      const result = await processDeconstructQueueItem({
        item: targetItem,
        userHint,
        selectedVisionModel,
        modelIds,
      });

      if (result.ok) {
        if (result.partial) partialCount++;
        else doneCount++;
        localQueue[idx] = {
          ...localQueue[idx],
          status: 'done',
          result: result.data as Record<string, unknown>,
          deconstructStats: result.stats as ImageSetQueueItem['deconstructStats'],
        };
      } else {
        errorCount++;
        localQueue[idx] = { ...localQueue[idx], status: 'error', error: result.error };
      }

      activeDeconstructWorkers = Math.max(0, activeDeconstructWorkers - 1);
      setProcessingQueueCount(activeDeconstructWorkers);
      syncPipelineQueue(idx);
    };

    try {
      const { scraperId, scraperSecret } = await getExternalScraperCredentials();
      const consumerConcurrency = Math.max(2, Math.min(queueConcurrency, 8));

      const consumerWorker = async () => {
        while (!producerFinished || deconstructWorkQueue.length > 0) {
          if (deconstructWorkQueue.length > 0) {
            const nextIdx = deconstructWorkQueue.shift();
            if (nextIdx !== undefined) {
              await executeDeconstructItem(nextIdx);
            }
          } else {
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      };

      const producerPromise = mapWithConcurrency(
        candidateUrls,
        Math.min(8, candidateUrls.length),
        async (url, cIdx) => {
          const parsed = await fetchParseLinkWithRateLimit(url, scraperId, scraperSecret, rateLimiter);
          if (parsed.success) {
            const filtered = filterParseLinkImages(parsed.media, url);
            if (filtered.ok) {
              const newQueueIdx = localQueue.length;
              localQueue.push(toXhsQueueItem(filtered, url, newQueueIdx));
              deconstructWorkQueue.push(newQueueIdx);
              syncPipelineQueue();
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }

          setXhsParseProgress((prev) =>
            prev
              ? {
                  ...prev,
                  current: cIdx + 1,
                  success: localQueue.length,
                  skipped: skippedCount,
                }
              : null
          );
        }
      ).then(() => {
        producerFinished = true;
        setIsParsingXhsLinks(false);
      });

      const consumerPromise = Promise.all(
        Array.from({ length: consumerConcurrency }, () => consumerWorker())
      );

      await Promise.all([producerPromise, consumerPromise]);

      setXhsLinksInput('');
      onRefreshAssets();

      const allRows = localQueue.map((item) => transformQueueItemToRecordRow(item));
      setDeconstructRecordRows(allRows);

      let savedCsvFilename: string | null = null;
      if (allRows.some((r) => r.status === 'success' || r.status === 'partial')) {
        try {
          savedCsvFilename = await exportDeconstructRecordsToCsv(allRows);
          setLastExportedCsvFilename(savedCsvFilename);
        } catch (csvErr) {
          console.error('自动导出反推 CSV 报表失败:', csvErr);
        }
      }

      const totalProcessed = doneCount + partialCount + errorCount;
      const csvTip = savedCsvFilename ? `，并已自动导出解析报表：${savedCsvFilename}` : '';
      if (errorCount === 0 && partialCount === 0) {
        showToast(`采编反推闭环流水线全部完成并已入库${csvTip}`);
      } else {
        showToast(
          `闭环处理完成 ${totalProcessed} 套：成功 ${doneCount + partialCount} 套，失败 ${errorCount} 套${csvTip}`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`闭环流水线异常: ${message}`);
    } finally {
      isDeconstructingRef.current = false;
      setIsDeconstructing(false);
      setIsParsingXhsLinks(false);
      setXhsParseProgress(null);
      setProcessingQueueCount(0);
      setCurrentQueueIndex(-1);
    }
  }, [
    xhsLinksInput,
    isParsingXhsLinks,
    isDeconstructingRef,
    multimodalModels,
    queue,
    userHint,
    selectedVisionModel,
    queueConcurrency,
    setQueue,
    setCurrentQueueIndex,
    setIsDeconstructing,
    setProcessingQueueCount,
    setDeconstructRecordRows,
    setLastExportedCsvFilename,
    showToast,
    onRefreshAssets,
  ]);

  return {
    deconstructSourceMode,
    setDeconstructSourceMode,
    xhsLinksInput,
    setXhsLinksInput,
    isParsingXhsLinks,
    xhsParseProgress,
    collectionIssues,
    handleBatchParseXhsLinks,
    runFullPipelineClosedLoop,
  };
}
