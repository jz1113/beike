import { useState, useEffect, useRef, useCallback } from 'react';
import { processDeconstructQueueItem } from '@/lib/deconstructClient';
import {
  getEnabledMultimodalModelsFromSettings,
  resolveStoredMultimodalModelId,
  type WorkflowCapability,
} from '@beike/shared/workflowModels';
import {
  exportDeconstructRecordsToCsv,
  transformQueueItemToRecordRow,
  type DeconstructedRecordRow,
} from '../assetDeconstructCsvExport';
import { buildQueueItemsFromFiles } from '../assetFolderImport';
import type { ImageSetQueueItem } from '../assetPromptConstants';
import { getSubCategoriesForCategory, type ActionCategoryId } from '@beike/shared/productCategoryHelpers';
import {
  clearDeconstructQueueDraft,
  persistDeconstructQueue,
  persistQueueConcurrency,
  readDeconstructQueueDraft,
  readQueueConcurrency,
} from '../deconstructQueueStorage';

function loadMultimodalModels(): WorkflowCapability[] {
  return getEnabledMultimodalModelsFromSettings();
}

export type UseDeconstructQueueOptions = {
  showToast: (msg: string) => void;
  onRefreshAssets: () => void;
};

export function useDeconstructQueue({ showToast, onRefreshAssets }: UseDeconstructQueueOptions) {
  const [showDeconstructModal, setShowDeconstructModal] = useState(false);
  const [multimodalModels, setMultimodalModels] = useState<WorkflowCapability[]>(() => loadMultimodalModels());
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>(() =>
    resolveStoredMultimodalModelId(loadMultimodalModels())
  );
  const [targetCategory, setTargetCategory] = useState<ActionCategoryId>('jewelry');
  const [queue, setQueue] = useState<ImageSetQueueItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(-1);
  const [userHint, setUserHint] = useState('');
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [queueConcurrency, setQueueConcurrency] = useState<number>(() => readQueueConcurrency());
  const [processingQueueCount, setProcessingQueueCount] = useState(0);
  const [deconstructRecordRows, setDeconstructRecordRows] = useState<DeconstructedRecordRow[]>([]);
  const [lastExportedCsvFilename, setLastExportedCsvFilename] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isDeconstructingRef = useRef(false);

  useEffect(() => {
    const draft = readDeconstructQueueDraft();
    if (!draft) return;
    const hasPending = draft.queue.some(
      (item) => item.status === 'pending' || item.status === 'processing' || item.status === 'error'
    );
    if (!hasPending) {
      clearDeconstructQueueDraft();
      return;
    }
    const restore = window.confirm(
      '检测到上次反推队列未完成（可能因页面刷新中断）。是否恢复队列并继续？'
    );
    if (restore) {
      setQueue(draft.queue.map((it) => (it.status === 'processing' ? { ...it, status: 'pending' as const } : it)));
      setCurrentQueueIndex(draft.currentQueueIndex);
      setUserHint(draft.userHint);
      setSelectedVisionModel(draft.selectedVisionModel);
      setShowDeconstructModal(true);
    } else {
      clearDeconstructQueueDraft();
    }
  }, []);

  useEffect(() => {
    if (!showDeconstructModal) return;
    const models = loadMultimodalModels();
    setMultimodalModels(models);
    setSelectedVisionModel((prev) => {
      if (models.some((m) => m.id === prev)) return prev;
      return resolveStoredMultimodalModelId(models);
    });
  }, [showDeconstructModal]);

  useEffect(() => {
    if (!isDeconstructing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDeconstructing]);

  const handleCloseDeconstructModal = useCallback(() => {
    if (isDeconstructing) {
      const ok = window.confirm('反推正在进行中，关闭将中断当前任务。确定关闭吗？');
      if (!ok) return;
      isDeconstructingRef.current = false;
      setIsDeconstructing(false);
    }
    setShowDeconstructModal(false);
  }, [isDeconstructing]);

  const handleQueueConcurrencyChange = useCallback((value: number) => {
    const next = Math.min(8, Math.max(1, value));
    setQueueConcurrency(next);
    persistQueueConcurrency(next);
  }, []);

  const processFilesOrFolders = useCallback(
    async (fileList: FileList | File[]) => {
      showToast(`⏳ 正在读取并解析文件...`);
      const { queueItems, imageCount, skipped, truncatedCount } = await buildQueueItemsFromFiles(fileList);
      if (queueItems.length === 0) {
        showToast(
          imageCount === 0
            ? '⚠️ 未识别到图片文件（支持 JPG / PNG / WEBP / AVIF / HEIC 等）'
            : skipped.length > 0
              ? `⚠️ 未采编到符合条件的图集（跳过 ${skipped.length} 套：不足3张图）`
              : '⚠️ 未能成功提取图集内容'
        );
        return;
      }
      setQueue((prev) => [...prev, ...queueItems]);
      setShowDeconstructModal(true);
      const skipTip = skipped.length > 0 ? `，跳过 ${skipped.length} 套（不足3张图）` : '';
      const truncateTip = truncatedCount > 0 ? `，${truncatedCount} 套已截取前 10 张` : '';
      showToast(`📁 成功识别 ${queueItems.length} 套图集${skipTip}${truncateTip}`);
    },
    [showToast]
  );

  const runQueueDeconstruction = useCallback(async () => {
    if (isDeconstructingRef.current) return;

    const pendingIndices = queue
      .map((item, idx) => (item.status === 'pending' || item.status === 'error' ? idx : -1))
      .filter((i) => i !== -1);

    if (pendingIndices.length === 0) {
      showToast('⚠️ 没有待处理的图集队列');
      return;
    }

    isDeconstructingRef.current = true;
    setIsDeconstructing(true);

    const modelIds = multimodalModels.map((m) => m.id).filter(Boolean);
    if (modelIds.length === 0) {
      showToast('请先在设置 → 服务接口配置中启用多模态模型');
      isDeconstructingRef.current = false;
      setIsDeconstructing(false);
      return;
    }

    const concurrency = Math.min(queueConcurrency, pendingIndices.length);
    let doneCount = 0;
    let partialCount = 0;
    let errorCount = 0;
    let workingQueue = [...queue];
    const workQueue = [...pendingIndices];
    let activeWorkers = 0;

    const syncQueueState = (idx: number) => {
      setQueue([...workingQueue]);
      setCurrentQueueIndex(idx);
      persistDeconstructQueue({
        queue: workingQueue,
        currentQueueIndex: idx,
        userHint,
        selectedVisionModel,
      });
    };

    const processQueueItem = async (idx: number) => {
      const targetItem = workingQueue[idx];
      if (!targetItem) return;

      activeWorkers++;
      setProcessingQueueCount(activeWorkers);

      workingQueue = workingQueue.map((it, i) =>
        i === idx ? { ...it, status: 'processing' as const, error: undefined } : it
      );
      syncQueueState(idx);

      const customSubCategories = getSubCategoriesForCategory(targetCategory);
      const result = await processDeconstructQueueItem({
        item: targetItem,
        userHint,
        selectedVisionModel,
        modelIds,
        targetCategory,
        customSubCategories,
      });

      if (result.ok) {
        if (result.partial) partialCount++;
        else doneCount++;
        workingQueue = workingQueue.map((it, i) =>
          i === idx
            ? {
                ...it,
                status: 'done' as const,
                result: result.data as Record<string, unknown>,
                deconstructStats: result.stats as ImageSetQueueItem['deconstructStats'],
              }
            : it
        );
      } else {
        errorCount++;
        workingQueue = workingQueue.map((it, i) =>
          i === idx ? { ...it, status: 'error' as const, error: result.error } : it
        );
      }

      activeWorkers = Math.max(0, activeWorkers - 1);
      setProcessingQueueCount(activeWorkers);
      syncQueueState(idx);
    };

    try {
      const workers = Array.from({ length: concurrency }, async () => {
        while (workQueue.length > 0) {
          const idx = workQueue.shift();
          if (idx === undefined) break;
          await processQueueItem(idx);
        }
      });

      await Promise.all(workers);
      onRefreshAssets();

      const allRows = workingQueue.map((item) => transformQueueItemToRecordRow(item));
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
        showToast(`🎉 图集队列反推全部完成并已入库${csvTip}！`);
      } else if (errorCount === 0 && partialCount > 0) {
        showToast(`⚠️ 已完成 ${totalProcessed} 套，其中 ${partialCount} 套部分图片反推失败${csvTip}`);
      } else if (errorCount > 0 && doneCount + partialCount > 0) {
        showToast(
          `⚠️ 处理 ${totalProcessed} 套：成功 ${doneCount + partialCount} 套，失败 ${errorCount} 套${csvTip}`
        );
      } else {
        showToast(`❌ 全部 ${errorCount} 套反推失败，可点击重试`);
      }
    } finally {
      isDeconstructingRef.current = false;
      setIsDeconstructing(false);
      setProcessingQueueCount(0);
      setCurrentQueueIndex(-1);
      clearDeconstructQueueDraft();
    }
  }, [
    queue,
    multimodalModels,
    queueConcurrency,
    userHint,
    selectedVisionModel,
    targetCategory,
    showToast,
    onRefreshAssets,
  ]);

  const exportQueueCsv = useCallback(async () => {
    const allRows = queue.map((it) => transformQueueItemToRecordRow(it));
    const fn = await exportDeconstructRecordsToCsv(allRows);
    setLastExportedCsvFilename(fn);
    showToast(`📥 已导出并保存反推记录表格: ${fn}`);
  }, [queue, showToast]);

  return {
    showDeconstructModal,
    setShowDeconstructModal,
    multimodalModels,
    selectedVisionModel,
    setSelectedVisionModel,
    targetCategory,
    setTargetCategory,
    queue,
    setQueue,
    currentQueueIndex,
    setCurrentQueueIndex,
    userHint,
    setUserHint,
    isDeconstructing,
    setIsDeconstructing,
    isDeconstructingRef,
    queueConcurrency,
    handleQueueConcurrencyChange,
    processingQueueCount,
    setProcessingQueueCount,
    deconstructRecordRows,
    setDeconstructRecordRows,
    lastExportedCsvFilename,
    setLastExportedCsvFilename,
    fileInputRef,
    folderInputRef,
    handleCloseDeconstructModal,
    processFilesOrFolders,
    runQueueDeconstruction,
    exportQueueCsv,
  };
}

export type DeconstructQueueApi = ReturnType<typeof useDeconstructQueue>;
