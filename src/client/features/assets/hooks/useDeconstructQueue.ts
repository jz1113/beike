import { useState, useEffect, useRef, useCallback } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readDeconstructJob, submitDeconstructJob, stopDeconstructJob, DeconstructJobRequestError } from '../api/deconstructJobsClient';
import { useDeconstructJobsState } from './useDeconstructJobs';
import { applyDeconstructJobToQueue } from '../model/deconstructJobs';
import { getDeconstructJobsState, isDeconstructJobActive, upsertDeconstructJob, updateDeconstructJobsState } from '../model/deconstructJobs';
import type { WorkflowCapability } from '@shared/domain/models/workflowModels';
import {
  exportDeconstructRecordsToCsv,
  transformQueueItemToRecordRow,
  type DeconstructedRecordRow,
} from '../model/assetDeconstructCsvExport';
import { buildQueueItemsFromFiles } from '../model/assetFolderImport';
import type { ImageSetQueueItem } from '../model/assetPromptConstants';
import { selectableDeconstructSubcategory } from '../model/deconstructJobs';
import {
  clearDeconstructQueueDraft,
  persistDeconstructQueue,
  persistQueueConcurrency,
  readDeconstructQueueDraft,
  readQueueConcurrency,
  persistDeconstructJobReceipt, readDeconstructJobReceiptState,
} from '../model/deconstructQueueStorage';
import {
  categoryForQueueItem,
  defaultDeconstructModelId,
  loadMultimodalModels,
  organizeQueueIntoFourImageGroups,
  resolveActionCategory,
  selectedQueueImages,
  selectableMajorCategoryId,
  subCategoriesForItem,
  type ProductCategoryOption,
} from './deconstructQueueOps';

export type UseDeconstructQueueOptions = {
  showToast: (msg: string) => void;
  onRefreshAssets: () => void;
  defaultProductCategoryId?: string | null;
  defaultProductSubcategory?: string | null;
  productCategories?: ProductCategoryOption[];
};

export function useDeconstructQueue({
  showToast,
  onRefreshAssets,
  defaultProductCategoryId = null,
  defaultProductSubcategory = null,
  productCategories,
}: UseDeconstructQueueOptions) {
  const [showDeconstructModal, setShowDeconstructModal] = useState(false);
  const [multimodalModels, setMultimodalModels] = useState<WorkflowCapability[]>(() => loadMultimodalModels());
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>(() =>
    defaultDeconstructModelId(loadMultimodalModels())
  );
  const [targetCategory, setTargetCategoryState] = useState<string>(() =>
    resolveActionCategory(defaultProductCategoryId, productCategories)
  );
  const activeTargetCategory = selectableMajorCategoryId(targetCategory, productCategories);
  const [targetSubcategory, setTargetSubcategory] = useState(() => selectableDeconstructSubcategory(
    defaultProductSubcategory, activeTargetCategory, productCategories,
  ));
  const activeTargetSubcategory = selectableDeconstructSubcategory(targetSubcategory, activeTargetCategory, productCategories);
  const targetSelectionInvalid = Boolean(targetCategory && !activeTargetCategory)
    || Boolean(targetSubcategory && !activeTargetSubcategory);
  const setTargetCategory = useCallback((value: string) => {
    setTargetCategoryState(value);
    setTargetSubcategory('');
  }, []);
  const [architectureMode] = useState<'auto'>('auto');
  const [queue, setQueue] = useState<ImageSetQueueItem[]>([]);
  const [backgroundJobId, setBackgroundJobId] = useState<string | null>(null);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const jobsState = useDeconstructJobsState();
  const backgroundJob = jobsState.jobs.find(job => job.jobId === backgroundJobId);
  const currentQueueIndex = queue.findIndex(item => item.status === 'processing');
  const [userHint, setUserHint] = useState('');
  const isDeconstructing = isSubmittingJob || Boolean(backgroundJob && isDeconstructJobActive(backgroundJob));
  const [queueConcurrency, setQueueConcurrency] = useState<number>(() => readQueueConcurrency());
  const processingQueueCount = backgroundJob?.items.filter(item => item.status === 'running').length || 0;
  const progressById = Object.fromEntries(backgroundJob?.items.filter(item => item.progress).map(item => [item.id, item.progress!]) || []);
  const deconstructStartedAt = backgroundJob ? Date.parse(backgroundJob.createdAt) : null;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const deconstructRecordRows: DeconstructedRecordRow[] = queue.map(transformQueueItemToRecordRow);
  const [lastExportedCsvFilename, setLastExportedCsvFilename] = useState<string | null>(null);

  useEffect(() => {
    if (showDeconstructModal || isDeconstructing || queue.some((item) => item.status !== 'done')) return;
    const majorId = selectableMajorCategoryId(resolveActionCategory(defaultProductCategoryId, productCategories), productCategories);
    setTargetCategoryState(majorId);
    setTargetSubcategory(selectableDeconstructSubcategory(defaultProductSubcategory, majorId, productCategories));
  }, [showDeconstructModal, isDeconstructing, queue, defaultProductCategoryId, defaultProductSubcategory, productCategories]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isDeconstructingRef = useRef(false);
  const lastSyncedJobRef = useRef('');
  const refreshedJobRef = useRef('');
  const submissionUncertainRef = useRef(false);
  const loadingDetailRef = useRef(false);
  const attemptedDetailRef = useRef('');
  const viewingJobRef = useRef('');
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    if (!isDeconstructing || deconstructStartedAt === null) return;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - deconstructStartedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isDeconstructing, deconstructStartedAt]);

  useEffect(() => {
    let draft = readDeconstructQueueDraft();
    const receipt = readDeconstructJobReceiptState();
    if (receipt && draft?.backgroundJobId !== receipt.jobId && receipt.savedAt > (draft?.draftSavedAt || 0)) draft = null;
    if (!draft) {
      const jobId = receipt?.jobId;
      if (!jobId) return;
      setBackgroundJobId(jobId);
      submissionUncertainRef.current = true;
      const workspace = getWorkspaceSecret();
      void readDeconstructJob(jobId).then(job => {
        if (getWorkspaceSecret() !== workspace) return;
        submissionUncertainRef.current = false;
        upsertDeconstructJob(job);
        setQueue(applyDeconstructJobToQueue(job, []));
        setTargetCategoryState(job.items[0]?.targetCategory || '');
        setTargetSubcategory(job.items[0]?.targetSubcategory || '');
      }).catch(() => { /* Keep the receipt; no automatic billable replay. */ });
      return;
    }
    if (draft.backgroundJobId) {
      submissionUncertainRef.current = true;
      setQueue(draft.queue);
      setBackgroundJobId(draft.backgroundJobId);
      setUserHint(draft.userHint);
      setSelectedVisionModel(draft.selectedVisionModel);
      setTargetCategoryState(draft.targetCategory || '');
      setTargetSubcategory(draft.targetSubcategory || '');
      // A lost submission response is reconciled read-only; never replay on mount.
      const workspace = getWorkspaceSecret();
      void readDeconstructJob(draft.backgroundJobId).then(job => {
        if (getWorkspaceSecret() !== workspace) return;
        submissionUncertainRef.current = false;
        upsertDeconstructJob(job);
      }).catch(error => {
        if (getWorkspaceSecret() !== workspace) return;
        if (error instanceof DeconstructJobRequestError && error.status === 404) {
          submissionUncertainRef.current = true;
          setQueue(draft.queue.map(item => item.status === 'processing' ? { ...item, status: 'pending' as const } : item));
          showToastRef.current('上次提交尚未确认，可重新打开导入窗口核对并使用同一任务编号提交');
        }
      });
      return;
    }
    const hasPending = draft.queue.some(
      (item) => item.status === 'pending' || item.status === 'processing' || item.status === 'error'
    );
    if (!hasPending) {
      clearDeconstructQueueDraft();
      return;
    }
    const restore = window.confirm(
      '检测到未完成的图集草稿。是否恢复查看？恢复不会自动反推。'
    );
    if (restore) {
      setQueue(draft.queue.map((it) => (it.status === 'processing' ? { ...it, status: 'error' as const, error: '旧任务结果未确认，请先核对资产库再重试' } : it)));
      setUserHint(draft.userHint);
      setSelectedVisionModel(draft.selectedVisionModel);
      setTargetCategoryState(draft.targetCategory || '');
      setTargetSubcategory(typeof draft.targetSubcategory === 'string' ? draft.targetSubcategory : '');
      setShowDeconstructModal(true);
    } else {
      clearDeconstructQueueDraft();
    }
  }, []);

  const syncModels = useCallback(() => {
    const models = loadMultimodalModels();
    setMultimodalModels(models);
    setSelectedVisionModel((prev) => (models.some((m) => m.id === prev) ? prev : defaultDeconstructModelId(models)));
  }, []);

  useEffect(() => {
    if (showDeconstructModal) syncModels();
  }, [showDeconstructModal, syncModels]);

  useEffect(() => {
    window.addEventListener('models_updated', syncModels);
    window.addEventListener('modality_models_updated', syncModels);
    return () => {
      window.removeEventListener('models_updated', syncModels);
      window.removeEventListener('modality_models_updated', syncModels);
    };
  }, [syncModels]);

  useEffect(() => {
    if (!queue.length || (!backgroundJobId && !showDeconstructModal)) return;
    persistDeconstructQueue({ queue, currentQueueIndex, userHint, selectedVisionModel, targetCategory, targetSubcategory, backgroundJobId: backgroundJobId || undefined });
  }, [showDeconstructModal, queue, currentQueueIndex, userHint, selectedVisionModel, targetCategory, targetSubcategory, backgroundJobId]);

  useEffect(() => {
    if (!backgroundJob || lastSyncedJobRef.current === `${backgroundJob.jobId}:${backgroundJob.updatedAt}`) return;
    const version = `${backgroundJob.jobId}:${backgroundJob.updatedAt}`;
    if (backgroundJob.items.some(item => item.result?.ok && item.result.data === null) && attemptedDetailRef.current !== version) {
      if (!loadingDetailRef.current) {
        loadingDetailRef.current = true;
        const workspace = getWorkspaceSecret();
        void readDeconstructJob(backgroundJob.jobId).then(job => {
          if (getWorkspaceSecret() === workspace) {
            attemptedDetailRef.current = version;
            upsertDeconstructJob(job);
          }
        }).catch(() => {
          if (getWorkspaceSecret() === workspace) showToast('结果详情暂未同步，后台结果已保留，可稍后重新查看');
        }).finally(() => { loadingDetailRef.current = false; });
      }
      return;
    }
    lastSyncedJobRef.current = `${backgroundJob.jobId}:${backgroundJob.updatedAt}`;
    setQueue(previous => applyDeconstructJobToQueue(backgroundJob, previous));
    if (!isDeconstructJobActive(backgroundJob) && refreshedJobRef.current !== backgroundJob.jobId) {
      refreshedJobRef.current = backgroundJob.jobId;
      isDeconstructingRef.current = false;
      onRefreshAssets();
    }
  }, [backgroundJob, onRefreshAssets, showToast]);

  useEffect(() => {
    if (!jobsState.viewJobId) return;
    const jobId = jobsState.viewJobId;
    if (viewingJobRef.current === jobId) return;
    viewingJobRef.current = jobId;
    const workspace = getWorkspaceSecret();
    void readDeconstructJob(jobId).then(job => {
      if (getWorkspaceSecret() !== workspace || getDeconstructJobsState().viewJobId !== jobId) return;
      upsertDeconstructJob(job);
      setBackgroundJobId(job.jobId);
      setQueue(applyDeconstructJobToQueue(job, []));
      setShowDeconstructModal(true);
      updateDeconstructJobsState({ viewJobId: null });
    }).catch(() => {
      if (getWorkspaceSecret() !== workspace) return;
      showToast('结果暂时无法读取，请稍后再查看。后台任务会继续。');
      if (getDeconstructJobsState().viewJobId === jobId) updateDeconstructJobsState({ viewJobId: null });
    }).finally(() => { viewingJobRef.current = ''; });
  }, [jobsState.viewJobId, showToast]);

  const handleCloseDeconstructModal = useCallback(() => {
    setShowDeconstructModal(false);
  }, []);

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
              ? `⚠️ 未采编到符合条件的图集（跳过 ${skipped.length} 套：不足4张图）`
              : '⚠️ 未能成功提取图集内容'
        );
        return;
      }
      setQueue((prev) => [...prev, ...queueItems]);
      setShowDeconstructModal(true);
      const skipTip = skipped.length > 0 ? `，跳过 ${skipped.length} 处（不足4张图）` : '';
      const truncateTip = truncatedCount > 0 ? `，余下不足4张已自动略过` : '';
      showToast(`📁 已按每 4 张一组自动整理 ${queueItems.length} 组${skipTip}${truncateTip}`);
    },
    [showToast]
  );

  const runQueueDeconstruction = useCallback(async (options?: { reviewBeforeSave?: boolean }) => {
    if (isDeconstructingRef.current || isDeconstructing) return;
    if (targetSelectionInvalid) {
      showToast('所选归档文件夹已删除或不再属于当前大类，请重新选择');
      return;
    }
    const organizedQueue = organizeQueueIntoFourImageGroups(queue);
    const pending = organizedQueue.filter(item => (item.status === 'pending' || item.status === 'error') && selectedQueueImages(item).length === 4);
    if (!pending.length) { showToast('至少需要 4 张有效图片才能组成一组四图母本'); return; }
    if (organizedQueue.length !== queue.length || organizedQueue.some((item, idx) => item !== queue[idx])) {
      setQueue(organizedQueue);
    }
    const modelIds = multimodalModels.map(model => model.id).filter(Boolean);
    if (!modelIds.length) { showToast('请先在设置中启用多模态模型'); return; }
    isDeconstructingRef.current = true;
    setIsSubmittingJob(true);
    const workspace = getWorkspaceSecret();
    // Keep one stable identity until the acceptance is known. The retry button
    // may submit the same identity again; the server deduplicates before work.
    const jobId = submissionUncertainRef.current && backgroundJobId ? backgroundJobId : crypto.randomUUID();
    if (!persistDeconstructJobReceipt(jobId)) {
      showToast('浏览器无法保存任务编号，请释放浏览器存储空间后再提交，避免刷新后重复反推。');
      isDeconstructingRef.current = false;
      setIsSubmittingJob(false);
      return;
    }
    setBackgroundJobId(jobId);
    persistDeconstructQueue({ queue: organizedQueue, currentQueueIndex: -1, userHint, selectedVisionModel, targetCategory, targetSubcategory, backgroundJobId: jobId });
    try {
      if (submissionUncertainRef.current) {
        try {
          const existing = await readDeconstructJob(jobId);
          if (getWorkspaceSecret() !== workspace) return;
          upsertDeconstructJob(existing);
          submissionUncertainRef.current = false;
          setShowDeconstructModal(false);
          return;
        } catch (error) {
          if (getWorkspaceSecret() !== workspace) return;
          if (!(error instanceof DeconstructJobRequestError && error.status === 404)) throw error;
        }
      }
      if (getWorkspaceSecret() !== workspace) return;
      const job = await submitDeconstructJob({ jobId,
        items: pending.map(item => {
          const major = categoryForQueueItem(item, activeTargetCategory, productCategories);
          return { id: item.id, name: item.name, images: selectedQueueImages(item), targetCategory: major,
            targetSubcategory: selectableDeconstructSubcategory(activeTargetSubcategory, major, productCategories),
            customSubCategories: major ? subCategoriesForItem(major, productCategories) : [] };
        }), userHint, selectedVisionModel, modelIds, concurrency: queueConcurrency, reviewBeforeSave: options?.reviewBeforeSave });
      if (getWorkspaceSecret() !== workspace) return;
      upsertDeconstructJob(job);
      submissionUncertainRef.current = false;
      setShowDeconstructModal(false);
      window.dispatchEvent(new Event('deconstruct-jobs-refresh'));
      showToast('已交给后台反推，可以继续使用其他页面');
    } catch (error) {
      if (getWorkspaceSecret() !== workspace) return;
      // Even a gateway error can arrive after acceptance. Only a read-only check
      // can establish the result; no new identity or automatic POST retry here.
      try {
        const existing = await readDeconstructJob(jobId);
        if (getWorkspaceSecret() !== workspace) return;
        upsertDeconstructJob(existing);
        submissionUncertainRef.current = false;
        setShowDeconstructModal(false);
      } catch {
        if (getWorkspaceSecret() !== workspace) return;
        submissionUncertainRef.current = true;
        showToast(`提交未确认：${error instanceof Error ? error.message : '连接失败'}。再次提交会核对同一任务，避免重复反推。`);
      }
    } finally {
      setIsSubmittingJob(false);
      isDeconstructingRef.current = false;
    }
  }, [queue, isDeconstructing, multimodalModels, userHint, selectedVisionModel, targetCategory, targetSubcategory, backgroundJobId,
    activeTargetCategory, activeTargetSubcategory, targetSelectionInvalid, productCategories, queueConcurrency, showToast]);

  const handleStopBackgroundJob = useCallback(async () => {
    if (!backgroundJobId) return;
    const workspace = getWorkspaceSecret();
    try {
      const job = await stopDeconstructJob(backgroundJobId);
      if (getWorkspaceSecret() === workspace) upsertDeconstructJob(job);
    }
    catch (error) { if (getWorkspaceSecret() === workspace) showToast(error instanceof Error ? error.message : '停止请求未确认，请核对进度'); }
  }, [backgroundJobId, showToast]);

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
    targetCategory: activeTargetCategory,
    setTargetCategory,
    targetSubcategory: activeTargetSubcategory,
    setTargetSubcategory,
    targetSelectionInvalid,
    productCategories,
    architectureMode,
    queue,
    setQueue,
    currentQueueIndex,
    userHint,
    setUserHint,
    isDeconstructing,
    backgroundJobId,
    isSubmittingJob,
    handleStopBackgroundJob,
    isDeconstructingRef,
    queueConcurrency,
    handleQueueConcurrencyChange,
    processingQueueCount,
    progressById,
    deconstructStartedAt,
    elapsedSeconds,
    deconstructRecordRows,
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
