import { useEffect, useMemo } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { isOpenAIModelRouteId } from '@shared/domain/models/workflowModels';
import { usePosterInputDraft } from './usePosterInputDraft';
import { loadPosterProductionSettings, persistPosterProductionSettings } from '../model/posterDraft';
import { loadPosterBatchHistory, resolvePosterWorkspaceScope } from '../model/posterBatchHistory';
import { normalizeConcurrency, normalizeCoverTitle, makeId, posterPreviewImages } from '../model/posterTypes';
import type { PosterItem } from '../model/posterTypes';
import { usePosterState } from './usePosterState';
import { createPosterHistory } from './createPosterHistory';
import { createPosterImport } from './createPosterImport';
import { createPosterGeneration } from './createPosterGeneration';
import { createPosterDownloads } from './createPosterDownloads';

export function usePosterProduction() {
  const state = usePosterState();
  const {
    fileInputRef, activeItemsRef, activeAttemptsRef, aliveRef, interruptActiveRef, abortRef,
    itemAbortControllers, isDraggingFile, setIsDraggingFile, items, isRunning, runningRef,
    restoringRef, exportingRef, importingRef, isReady, setIsReady, isImporting, isRestoring,
    isExporting, notice, availableImageModels, setAvailableImageModels, availableTitleModels,
    setAvailableTitleModels, imageModel, setImageModel, titleModel, setTitleModel, titleHandling,
    setTitleHandling, imageQuality, setImageQuality, concurrency, setConcurrency, memorySampleId,
    setMemorySampleId, isSettingsOpen, setIsSettingsOpen, settingsDraft, setSettingsDraft,
    previewState, setPreviewState, historyBatches, setHistoryBatches, itemsRef,
    availableTitleModelsRef, availableImageModelsRef, activeBatchIdRef, mediaWritesRef,
    recoveredResultUrlsRef, workspaceSecretRef, workspaceScopeRef, setItemsIfAlive,
    setNoticeIfAlive, workspaceChanged, ensureWorkspaceReady, productionModelError,
    abortAllItems,
  } = state;
  const history = createPosterHistory(state);
  const { persistActiveBatch, restoreHistoryBatch, deleteHistoryBatch, clearItems } = history;
  useEffect(() => {
    const interruptActive = () => interruptActiveRef.current();
    const abortState = abortRef.current;
    const controllers = itemAbortControllers.current;
    const mediaWrites = mediaWritesRef.current;
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortState.aborted = true;
      // A route change or renderer shutdown is not a model failure. Mark the
      // running records before cancelling their requests so they can resume
      // when this batch is opened again.
      interruptActive();
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
      const urls = recoveredResultUrlsRef.current;
      void Promise.allSettled(mediaWrites.values()).then(() => {
        for (const url of urls) URL.revokeObjectURL(url);
      });
      recoveredResultUrlsRef.current = [];
    };
  }, [abortRef, aliveRef, interruptActiveRef, itemAbortControllers, mediaWritesRef, recoveredResultUrlsRef]);

  const { pasteText, setPasteText, importMode, setImportMode, restoreInputDraft } = usePosterInputDraft(setNoticeIfAlive);

  const signalForItem = (id: string) => {
    const existing = itemAbortControllers.current.get(id);
    if (existing && !existing.signal.aborted) return existing.signal;
    const controller = new AbortController();
    itemAbortControllers.current.set(id, controller);
    return controller.signal;
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const secret = getWorkspaceSecret();
        const scope = await resolvePosterWorkspaceScope(secret);
        if (cancelled) return;
        if (secret !== getWorkspaceSecret()) throw new Error('工作区已切换，请刷新页面后再操作大字报。');
        const configured = loadSystemConfiguredModels();
        const saved = loadPosterProductionSettings();
        const titleModels = configured.availableVisionModels.filter(model => !isOpenAIModelRouteId(model.id));
        workspaceSecretRef.current = secret;
        workspaceScopeRef.current = scope;
        restoreInputDraft(scope);
        availableImageModelsRef.current = configured.availableImageModels;
        availableTitleModelsRef.current = titleModels;
        setHistoryBatches(loadPosterBatchHistory(scope));
        setAvailableImageModels(configured.availableImageModels);
        setAvailableTitleModels(titleModels);
        setImageModel(configured.availableImageModels.find(model => model.id === saved.imageModel)?.id
          || configured.availableImageModels.find(model => model.id === configured.selectedImageGenModel)?.id
          || configured.availableImageModels[0]?.id || '');
        setTitleModel(titleModels.find(model => model.id === saved.titleModel)?.id || titleModels[0]?.id || '');
        setTitleHandling(saved.titleHandling || 'rewrite');
        setImageQuality(saved.imageQuality || 'high');
        setConcurrency(normalizeConcurrency(saved.concurrency));
        setMemorySampleId(saved.memorySampleId || '');
        setIsReady(true);
      } catch (error) {
        if (!cancelled) setNoticeIfAlive(error instanceof Error ? error.message : '工作区初始化失败，请刷新页面重试。');
      }
    })();
    return () => { cancelled = true; };
  }, [restoreInputDraft, availableImageModelsRef, availableTitleModelsRef, setAvailableImageModels, setAvailableTitleModels, setConcurrency, setHistoryBatches, setImageModel, setImageQuality, setIsReady, setMemorySampleId, setNoticeIfAlive, setTitleHandling, setTitleModel, workspaceScopeRef, workspaceSecretRef]);

  useEffect(() => {
    const onWorkspaceChange = (event: StorageEvent) => {
      if ((event.key === null || event.key === 'beike_workspace_secret') && workspaceSecretRef.current && workspaceChanged()) {
        abortRef.current.aborted = true;
        interruptActiveRef.current();
        abortAllItems();
        setIsReady(false);
        setNoticeIfAlive('工作区已切换，已停止等待并保留原任务；请刷新页面后继续。');
      }
    };
    window.addEventListener('storage', onWorkspaceChange);
    return () => window.removeEventListener('storage', onWorkspaceChange);
  }, [abortAllItems, abortRef, interruptActiveRef, setIsReady, setNoticeIfAlive, workspaceChanged, workspaceSecretRef]);

  useEffect(() => {
    const refreshConfiguredModels = () => {
      try {
        const configured = loadSystemConfiguredModels();
        const titleModels = configured.availableVisionModels.filter(model => !isOpenAIModelRouteId(model.id));
        availableImageModelsRef.current = configured.availableImageModels;
        availableTitleModelsRef.current = titleModels;
        setAvailableImageModels(configured.availableImageModels);
        setAvailableTitleModels(titleModels);
        setImageModel((current) => configured.availableImageModels.some((model) => model.id === current)
          ? current
          : configured.availableImageModels.find(model => model.id === configured.selectedImageGenModel)?.id
            || configured.availableImageModels[0]?.id || '');
        setTitleModel((current) => titleModels.some((model) => model.id === current)
          ? current
          : titleModels[0]?.id || '');
      } catch {
        setNoticeIfAlive('模型配置读取失败，请检查系统设置后重试。');
      }
    };
    window.addEventListener('models_updated', refreshConfiguredModels);
    return () => window.removeEventListener('models_updated', refreshConfiguredModels);
  }, [availableImageModelsRef, availableTitleModelsRef, setAvailableImageModels, setAvailableTitleModels, setImageModel, setNoticeIfAlive, setTitleModel]);

  useEffect(() => {
    if (!activeBatchIdRef.current || items.length === 0) return undefined;
    const timer = window.setTimeout(() => { void persistActiveBatch(itemsRef.current); }, 220);
    return () => window.clearTimeout(timer);
    // The snapshot must be refreshed for every item and production-setting change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, imageModel, titleModel, titleHandling, imageQuality, concurrency, memorySampleId]);

  const openProductionSettings = () => {
    setSettingsDraft({ imageModel, titleModel, titleHandling, imageQuality, concurrency, memorySampleId });
    setIsSettingsOpen(true);
  };

  const closeProductionSettings = () => {
    setIsSettingsOpen(false);
    setSettingsDraft(null);
  };

  const saveProductionSettings = () => {
    if (!settingsDraft || runningRef.current || restoringRef.current || !ensureWorkspaceReady()) return;
    const next = { ...settingsDraft, concurrency: normalizeConcurrency(settingsDraft.concurrency) };
    const modelError = productionModelError(next);
    if (modelError) { setNoticeIfAlive(modelError); return; }
    setImageModel(next.imageModel);
    setTitleModel(next.titleModel);
    setTitleHandling(next.titleHandling);
    setImageQuality(next.imageQuality);
    setConcurrency(next.concurrency);
    setMemorySampleId(next.memorySampleId || '');
    const persisted = persistPosterProductionSettings(next);
    if (persisted) {
      setNoticeIfAlive(`生产设置已保存：${next.titleHandling === 'original' ? '保留原标题' : 'AI 优化标题'}，并行任务 ${next.concurrency} 条。`);
    } else {
      setNoticeIfAlive('设置已应用到当前任务，但浏览器无法保存本地配置。');
    }
    closeProductionSettings();
  };

  const completedCount = useMemo(() => items.filter((item) => item.status === 'complete').length, [items]);
  const failedCount = useMemo(() => items.filter((item) => item.status === 'failed'
    && (!item.importError || item.imageTaskId || item.generatedSceneUrl || item.generationRecoveryRequired)).length, [items]);
  const previewItem = useMemo(() => previewState ? items.find((item) => item.id === previewState.itemId) ?? null : null, [items, previewState]);
  const previewImages = useMemo(() => previewItem ? posterPreviewImages(previewItem) : [], [previewItem]);

  const updateItem = (id: string, patch: Partial<PosterItem>) => {
    // The unmount cleanup already saved interruption and the submission key.
    // Late responses must not overwrite a batch restored by a new studio instance.
    if (!aliveRef.current) return;
    if ('resultUrl' in patch) {
      const previous = itemsRef.current.find((item) => item.id === id);
      if (patch.resultUrl !== previous?.resultUrl) {
        if (patch.resultUrl?.startsWith('blob:')) recoveredResultUrlsRef.current.push(patch.resultUrl);
        if (previous?.resultUrl && recoveredResultUrlsRef.current.includes(previous.resultUrl)) {
          const url = previous.resultUrl;
          recoveredResultUrlsRef.current = recoveredResultUrlsRef.current.filter((owned) => owned !== url);
          void Promise.resolve(previous.persistedResultKey && mediaWritesRef.current.get(previous.persistedResultKey))
            .then(() => URL.revokeObjectURL(url));
        }
        patch = { ...patch, persistedResultKey: patch.resultUrl ? `headline_poster_result:${activeBatchIdRef.current}:${id}:${makeId()}` : undefined };
      }
    }
    const next = itemsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item);
    itemsRef.current = next;
    setItemsIfAlive(next);
    if (patch.status === 'complete' || patch.status === 'failed' || patch.status === 'interrupted' || patch.resultUrl || 'imageSubmissionKey' in patch || 'imageTaskId' in patch || 'generatedSceneUrl' in patch) void persistActiveBatch(next);
  };

  /**
   * Cancellation must never be serialized as a failed model request. Keeping a
   * first-class interrupted state also makes an in-app stop immediately clear
   * instead of leaving cards stuck in a loading stage.
   */
  const markActiveItemsInterrupted = () => {
    if (activeItemsRef.current.size === 0) return;
    const activeIds = activeItemsRef.current;
    const next = itemsRef.current.map((item) => {
      if (!activeIds.has(item.id)) return item;
      const attempt = activeAttemptsRef.current.get(item.id);
      const needsRecovery = Boolean(attempt?.recovering || attempt?.dispatched);
      return {
        ...item,
        status: 'interrupted' as const,
        ...(!needsRecovery ? { imageSubmissionKey: undefined } : {}),
        error: needsRecovery ? '已停止等待，原生图任务可能仍在运行；继续时会核对原任务。' : undefined,
        generationRecoveryRequired: needsRecovery,
        modelFallbackNote: undefined,
      };
    });
    itemsRef.current = next;
    setItemsIfAlive(next);
    void persistActiveBatch(next);
  };

  interruptActiveRef.current = markActiveItemsInterrupted;

  const { importFile, handleFileDrop, importPaste } = createPosterImport({ ...state, ...history, pasteText });

  const editCoverTitle = (id: string, value: string): boolean => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    const item = itemsRef.current.find((row) => row.id === id);
    if (!item || item.importError) return false;
    if (item.status !== 'complete' && !item.generatedSceneUrl && (item.generationRecoveryRequired || item.imageTaskId)) {
      setNoticeIfAlive('请先核对原生图任务，确认结果后再修改标题。');
      return false;
    }
    const title = normalizeCoverTitle(value);
    if (title.length < 7 || title.length > 12) {
      setNoticeIfAlive('手动封面标题请保持 7–12 字；不会自动截断词语。');
      return false;
    }
    if (title === item.coverTitle) {
      if (!item.isTitleEdited) updateItem(id, { isTitleEdited: true });
      setNoticeIfAlive('标题内容未变，已保留现有成品与原任务记录。');
      return true;
    }
    updateItem(id, {
      coverTitle: title, isTitleEdited: true, status: 'idle', error: undefined,
      memorySampleId: undefined, memoryEntryIds: undefined, memoryUsageId: undefined, memoryRevisionId: undefined, memoryWarning: undefined,
      resultUrl: undefined, prompt: undefined, promptVersion: undefined, designPlan: undefined,
      imageTaskId: undefined, imageSubmissionKey: undefined, generatedSceneUrl: undefined,
      generationRecoveryRequired: false,
    });
    setNoticeIfAlive('封面标题已更新，生成时会保留手动标题。');
    return true;
  };

  const isAborted = () => abortRef.current.aborted || workspaceChanged();

  const stopBatch = () => {
    if (!runningRef.current || abortRef.current.aborted) return;
    abortRef.current.aborted = true;
    markActiveItemsInterrupted();
    abortAllItems();
    setNoticeIfAlive('正在停止等待；已提交的生图任务将保留，继续时会核对原任务。');
  };

  const { runItem, runBatch } = createPosterGeneration({ ...state, ...history, updateItem, signalForItem, isAborted });
  const { exportZip, downloadOne, downloadOriginalScene } = createPosterDownloads(state);

  return {
    fileInputRef,
    pasteText, setPasteText,
    importMode, setImportMode,
    isDraggingFile, setIsDraggingFile,
    items, isReady, isRunning, isImporting, isRestoring, isExporting, notice,
    availableImageModels, availableTitleModels,
    imageModel, titleModel, titleHandling, imageQuality, concurrency, memorySampleId,
    isSettingsOpen, settingsDraft, setSettingsDraft,
    previewState, setPreviewState, previewItem, previewImages,
    completedCount, failedCount, historyBatches, activeBatchId: activeBatchIdRef.current,
    openProductionSettings, closeProductionSettings, saveProductionSettings,
    importFile, handleFileDrop, importPaste, clearItems, restoreHistoryBatch, deleteHistoryBatch,
    updateItem, editCoverTitle, runItem, runBatch, stopBatch, exportZip, downloadOne, downloadOriginalScene,
  };
}
