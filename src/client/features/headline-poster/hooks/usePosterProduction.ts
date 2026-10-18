/* eslint-disable max-lines -- Batch production and recovery share one state machine. */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { deleteDerived, getDerived, putDerived } from '@client/shared/media/idbMediaCache';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { isOpenAIModelRouteId } from '@shared/domain/models/workflowModels';
import { reservedArtDirectionFor, sourceKey } from '../model/reservedArtDirections';
import { directCoverDesign, generateFinalCover, rewriteCoverTitle } from '../api/posterApi';
import {
  getActiveCoverStyleId,
  getAllCoverStyles,
  getStyleCorrections,
  setActiveCoverStyleId as persistActiveCoverStyleId,
} from '../model/coverMemoryStorage';
import { logMemoryAudit } from '../model/coverAuditStorage';
import { parseTable } from '../model/parsePosterTable';
import { assertPosterPasteSize, assertPosterSheetImportRange } from '../model/posterImportLimits';
import { mergePosterItems } from '../model/mergePosterItems';
import { usePosterInputDraft } from './usePosterInputDraft';
import { loadPosterProductionSettings, persistPosterProductionSettings } from '../model/posterSettings';
import {
  loadPosterBatchHistory,
  persistPosterBatchRecord,
  removePosterBatchRecord,
  resolvePosterWorkspaceScope,
  type PosterBatchRecord,
  type PosterBatchSnapshotItem,
} from '../model/posterBatchHistory';
import {
  POSTER_CONCURRENCY_OPTIONS,
  buildDesignPlan,
  normalizeConcurrency,
  normalizeCoverTitle,
  makeId,
  preservedOriginalTitle,
  posterInputError,
  safeBaseName,
  shouldRewriteCoverTitle,
  type ImageQuality,
  type PosterItem,
  type PosterProductionSettings,
} from '../model/posterTypes';

export function usePosterProduction() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemsRef = useRef(new Set<string>());
  const activeAttemptsRef = useRef(new Map<string, { recovering: boolean; dispatched: boolean }>());
  const aliveRef = useRef(true);
  const interruptActiveRef = useRef<() => void>(() => {});
  const abortRef = useRef({ aborted: false });
  const itemAbortControllers = useRef(new Map<string, AbortController>());
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [items, setItems] = useState<PosterItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const restoringRef = useRef(false);
  const exportingRef = useRef(false);
  const importingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [availableImageModels, setAvailableImageModels] = useState<Array<{ id: string; name?: string; shortName?: string }>>([]);
  const [availableTitleModels, setAvailableTitleModels] = useState<Array<{ id: string; name?: string; shortName?: string }>>([]);
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [titleModel, setTitleModel] = useState('gemini-3.7-flash');
  const [titleHandling, setTitleHandling] = useState<PosterProductionSettings['titleHandling']>('rewrite');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('high');
  const [concurrency, setConcurrency] = useState<number>(POSTER_CONCURRENCY_OPTIONS[0]);
  const [activeStyleId, setActiveStyleIdState] = useState<string>(getActiveCoverStyleId);
  const activeStyleIdRef = useRef(activeStyleId);
  const setActiveStyleId = (styleId: string) => {
    setActiveStyleIdState(styleId);
    activeStyleIdRef.current = styleId;
    persistActiveCoverStyleId(styleId);
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<PosterProductionSettings | null>(null);
  const [previewState, setPreviewState] = useState<{ itemId: string; index: number } | null>(null);
  const [historyBatches, setHistoryBatches] = useState<PosterBatchRecord[]>([]);
  const itemsRef = useRef(items);
  const titleModelRef = useRef(titleModel);
  const availableTitleModelsRef = useRef(availableTitleModels);
  const availableImageModelsRef = useRef(availableImageModels);
  const titleHandlingRef = useRef(titleHandling);
  const imageModelRef = useRef(imageModel);
  const imageQualityRef = useRef(imageQuality);
  const activeBatchIdRef = useRef<string | null>(null);
  const activeBatchCreatedAtRef = useRef<number | null>(null);
  const activeBatchRevisionRef = useRef<string | null>(null);
  const persistedMediaKeysRef = useRef(new Set<string>());
  const mediaWritesRef = useRef(new Map<string, Promise<boolean>>());
  const recoveredResultUrlsRef = useRef<string[]>([]);
  const workspaceSecretRef = useRef<string | null>(null);
  const workspaceScopeRef = useRef<string | null>(null);
  const ownedGenerationLocksRef = useRef(new Set<string>());
  const metadataBarrierRef = useRef<Promise<unknown> | null>(null);
  itemsRef.current = items;
  titleModelRef.current = titleModel;
  availableTitleModelsRef.current = availableTitleModels;
  availableImageModelsRef.current = availableImageModels;
  titleHandlingRef.current = titleHandling;
  imageModelRef.current = imageModel;
  imageQualityRef.current = imageQuality;

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
  }, []);

  const setItemsIfAlive = (value: Parameters<typeof setItems>[0]) => {
    if (aliveRef.current) setItems(value);
  };
  const setNoticeIfAlive = (value: string | null) => {
    if (aliveRef.current) setNotice(value);
  };
  const setIsRunningIfAlive = (value: boolean) => {
    runningRef.current = value;
    if (aliveRef.current) setIsRunning(value);
  };
  const setIsExportingIfAlive = (value: boolean) => {
    exportingRef.current = value;
    if (aliveRef.current) setIsExporting(value);
  };

  const { pasteText, setPasteText, importMode, setImportMode, restoreInputDraft } = usePosterInputDraft(setNoticeIfAlive);

  const currentSettings = (): PosterProductionSettings => ({
    imageModel: imageModelRef.current,
    titleModel: titleModelRef.current,
    titleHandling: titleHandlingRef.current,
    imageQuality: imageQualityRef.current,
    concurrency,
  });

  const workspaceChanged = () => workspaceSecretRef.current !== getWorkspaceSecret();
  const ensureWorkspaceReady = () => {
    if (!workspaceScopeRef.current) {
      setNoticeIfAlive('工作区尚未准备好，请稍后重试。');
      return false;
    }
    if (workspaceChanged()) {
      setNoticeIfAlive('工作区已切换，请刷新页面后再操作大字报；当前批次仍保存在原工作区。');
      return false;
    }
    return true;
  };

  const productionModelError = (settings: PosterProductionSettings) => {
    if (!availableTitleModelsRef.current.some((model) => model.id === settings.titleModel)) return '标题与封面设计模型未启用，请在系统设置中启用模型并更新生产设置。';
    if (!availableImageModelsRef.current.some((model) => model.id === settings.imageModel)) return '当前生图模型未启用，请更新生产设置后再生成。';
    return undefined;
  };

  const ensureActiveBatch = () => {
    if (activeBatchIdRef.current) return activeBatchIdRef.current;
    activeBatchIdRef.current = `poster_batch_${makeId()}`;
    activeBatchCreatedAtRef.current = Date.now();
    activeBatchRevisionRef.current = null;
    persistedMediaKeysRef.current.clear();
    return activeBatchIdRef.current;
  };

  const releaseRecoveredResultUrls = () => {
    for (const url of recoveredResultUrlsRef.current) URL.revokeObjectURL(url);
    recoveredResultUrlsRef.current = [];
  };

  const removeResultCaches = async (keys: string[]) => {
    await Promise.all(keys.map(async (key) => {
      await mediaWritesRef.current.get(key);
      await deleteDerived(key).catch(() => undefined);
      persistedMediaKeysRef.current.delete(key);
    }));
  };

  const activeBatchIsCurrent = () => {
    const batchId = activeBatchIdRef.current;
    const scope = workspaceScopeRef.current;
    if (!batchId || !scope) return false;
    const latest = loadPosterBatchHistory(scope).find((record) => record.id === batchId);
    const revision = latest ? latest.revision || String(latest.updatedAt) : null;
    if (revision === activeBatchRevisionRef.current) return true;
    setNoticeIfAlive('此批次已在另一个页面更新或删除，已停止提交和覆盖；请刷新页面并重新打开历史批次。');
    return false;
  };

  const withHistoryWriteLock = <T,>(scope: string, operation: () => T): Promise<T> => globalThis.navigator?.locks
    ? navigator.locks.request(`headline-poster-history:${scope}`, operation)
    : Promise.resolve(operation());

  const withOwnedBatchLock = async <T,>(batchId: string, operation: () => Promise<T>, unavailable: () => T): Promise<T> => {
    if (!globalThis.navigator?.locks) return operation();
    return navigator.locks.request(`headline-poster:${workspaceScopeRef.current}:${batchId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return unavailable();
      ownedGenerationLocksRef.current.add(batchId);
      try { return await operation(); } finally { ownedGenerationLocksRef.current.delete(batchId); }
    });
  };

  const persistActiveBatch = async (targetItems = itemsRef.current) => {
    const batchId = activeBatchIdRef.current;
    if (!batchId || targetItems.length === 0) return true;
    const scope = workspaceScopeRef.current;
    if (!scope) return false;
    if (!activeBatchIsCurrent()) return false;
    const mediaWrites: Promise<boolean>[] = [];
    const snapshotItems: PosterBatchSnapshotItem[] = targetItems.map((item) => {
      const { resultUrl, ...rest } = item;
      const resultCacheKey = resultUrl ? item.persistedResultKey || `headline_poster_result:${batchId}:${item.id}` : undefined;
      if (resultUrl && (resultUrl.startsWith('data:') || resultUrl.startsWith('blob:')) && resultCacheKey && !persistedMediaKeysRef.current.has(resultCacheKey)) {
        let write = mediaWritesRef.current.get(resultCacheKey);
        if (!write) {
          write = fetchMediaBlob(resultUrl)
          .then((blob) => putDerived(resultCacheKey, blob, blob.type || 'image/jpeg'))
          .then(async () => {
            if (!await getDerived(resultCacheKey)) throw new Error('成品缓存不可用');
            persistedMediaKeysRef.current.add(resultCacheKey);
            return true;
          })
          .catch(() => {
            setNoticeIfAlive('成品已生成，但本地缓存未保存成功；请及时下载成品。');
            // A durable original scene can rebuild the JPEG. Legacy results
            // without such a source must remain visible until saved.
            return Boolean(item.generatedSceneUrl || item.imageTaskId);
          })
          .finally(() => { mediaWritesRef.current.delete(resultCacheKey); });
          mediaWritesRef.current.set(resultCacheKey, write);
        }
        mediaWrites.push(write);
      }
      return {
        ...rest,
        resultUrl: resultUrl && !resultUrl.startsWith('data:') && !resultUrl.startsWith('blob:') ? resultUrl : undefined,
        resultCacheKey,
      };
    });
    const record: PosterBatchRecord = {
      id: batchId,
      createdAt: activeBatchCreatedAtRef.current || Date.now(),
      updatedAt: Date.now(),
      revision: makeId(),
      settings: currentSettings(),
      items: snapshotItems,
    };
    const saveMetadata = () => withHistoryWriteLock(scope, () => {
        if (activeBatchIdRef.current !== batchId || !activeBatchIsCurrent()) return undefined;
        const result = persistPosterBatchRecord(record, scope);
        if (result.saved) {
          const stored = result.records.find((entry) => entry.id === batchId);
          activeBatchRevisionRef.current = stored ? stored.revision || String(stored.updatedAt) : null;
        }
        return result;
      });
    const metadataSave = (ownedGenerationLocksRef.current.has(batchId) ? saveMetadata() : withOwnedBatchLock(batchId, saveMetadata, () => {
      setNoticeIfAlive('另一个页面正在处理此批次，已保留原任务记录；请等待结束后再操作。');
      return undefined;
    })).catch(() => {
      setNoticeIfAlive('无法取得历史存储锁，已停止保存和提交；请刷新页面重试。');
      return undefined;
    });
    metadataBarrierRef.current = metadataSave;
    const persisted = await metadataSave;
    if (!persisted) { await Promise.all(mediaWrites); return false; }
    if (aliveRef.current) setHistoryBatches(persisted.records);
    if (!persisted.saved) setNoticeIfAlive('浏览器未能保存当前批次；请释放本地存储空间并下载已有成品。');
    const mediaSaved = await Promise.all(mediaWrites);
    if (persisted.saved) await removeResultCaches(persisted.removedResultCacheKeys);
    return persisted.saved && mediaSaved.every(Boolean);
  };

  const abortAllItems = () => {
    for (const controller of itemAbortControllers.current.values()) controller.abort();
    itemAbortControllers.current.clear();
  };

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
        setIsReady(true);
      } catch (error) {
        if (!cancelled) setNoticeIfAlive(error instanceof Error ? error.message : '工作区初始化失败，请刷新页面重试。');
      }
    })();
    return () => { cancelled = true; };
  }, [restoreInputDraft]);

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
  }, []);

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
  }, []);

  useEffect(() => {
    if (!activeBatchIdRef.current || items.length === 0) return undefined;
    const timer = window.setTimeout(() => { void persistActiveBatch(itemsRef.current); }, 220);
    return () => window.clearTimeout(timer);
    // The snapshot must be refreshed for every item and production-setting change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, imageModel, titleModel, titleHandling, imageQuality, concurrency]);

  const openProductionSettings = () => {
    setSettingsDraft({ imageModel, titleModel, titleHandling, imageQuality, concurrency });
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
  const previewImages = useMemo(() => previewItem ? Array.from(new Set([
    previewItem.sourceImageUrl,
    previewItem.generatedSceneUrl,
    previewItem.resultUrl,
  ].filter((url): url is string => Boolean(url)))) : [], [previewItem]);

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

  const appendParsedRows = (rows: unknown[][]) => {
    const parsed = parseTable(rows);
    if (parsed.length === 0) {
      setNoticeIfAlive('没有识别到可导入的行，请确认第一列为图片链接、第二列为标题、第三列为文字竖或文字横；第四列商品名称/型号可选。');
      return;
    }
    ensureActiveBatch();
    const next = mergePosterItems(itemsRef.current, parsed);
    itemsRef.current = next;
    setItemsIfAlive(next);
    void persistActiveBatch(next);
    setNoticeIfAlive(`已导入 ${parsed.length} 条：文字竖输出 720 × 960，文字横输出 1440 × 1440；商品名称/型号会作为可核验的标题锚点。`);
  };

  const importUploadFile = async (file: File) => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setNoticeIfAlive('仅支持导入 .xlsx、.xls 或 .csv 文件。');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNoticeIfAlive('表格文件超过 20MB，请拆分后导入。');
      return;
    }
    importingRef.current = true;
    setIsImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, sheetRows: 2002 });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('文件中没有可读取的工作表');
      assertPosterSheetImportRange(firstSheet);
      if (aliveRef.current && ensureWorkspaceReady()) appendParsedRows(XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '', raw: false }));
    } catch (error) {
      setNoticeIfAlive(`导入失败：${error instanceof Error ? error.message : '文件格式无法识别'}`);
    } finally {
      importingRef.current = false;
      if (aliveRef.current) setIsImporting(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) await importUploadFile(file);
    input.value = '';
  };

  const handleFileDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importUploadFile(file);
  };

  const importPaste = () => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    let rows: unknown[][];
    try {
      assertPosterPasteSize(pasteText);
      const workbook = XLSX.read(pasteText, { type: 'string', raw: true, sheetRows: 2002 });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (sheet) assertPosterSheetImportRange(sheet);
      rows = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) : [];
    } catch (error) {
      setNoticeIfAlive(`粘贴内容无法解析：${error instanceof Error ? error.message : '请使用表格复制的列或 CSV 文本。'}`);
      return false;
    }
    let parsed: PosterItem[];
    try { parsed = parseTable(rows); } catch (error) {
      setNoticeIfAlive(`导入失败：${error instanceof Error ? error.message : '内容过多，请拆分后导入。'}`);
      return false;
    }
    if (parsed.length === 0) {
      setNoticeIfAlive('没有识别到可导入的行，请确认第一列为图片链接、第二列为标题、第三列为文字竖或文字横；第四列商品名称/型号可选。');
      return false;
    }
    ensureActiveBatch();
    const nextItems = mergePosterItems(itemsRef.current, parsed);
    itemsRef.current = nextItems;
    setItemsIfAlive(nextItems);
    void persistActiveBatch(nextItems);
    setNoticeIfAlive(`已解析 ${parsed.length} 条。请在生产清单中确认或修改封面标题后，再开始批量生成。`);
    return true;
  };

  const restoreHistoryBatchInternal = async (record: PosterBatchRecord): Promise<boolean> => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    restoringRef.current = true;
    setIsRestoring(true);
    const restoredUrls: string[] = [];
    try {
      if (!await persistActiveBatch()) throw new Error('当前批次未保存成功，暂不能切换历史批次。');
      const latestRecord = loadPosterBatchHistory(workspaceScopeRef.current!).find((entry) => entry.id === record.id);
      if (!latestRecord) throw new Error('历史批次已更新或删除，请刷新历史列表后重试。');
      const restored = await Promise.all(latestRecord.items.map(async (snapshot) => {
        const { resultCacheKey, resultUrl: savedResultUrl, ...item } = snapshot;
        let resultUrl = savedResultUrl;
        if (resultCacheKey) {
          const blob = await getDerived(resultCacheKey);
          if (blob) {
            resultUrl = URL.createObjectURL(blob);
            restoredUrls.push(resultUrl);
          }
        }
        const wasInterrupted = ['rewriting', 'prompting', 'rendering', 'interrupted'].includes(item.status);
        const missingResult = item.status === 'complete' && !resultUrl;
        const requiresRecovery = item.generationRecoveryRequired || item.status === 'rendering' || missingResult;
        return {
          ...item, resultUrl, persistedResultKey: resultCacheKey,
          generationRecoveryRequired: requiresRecovery,
          status: missingResult ? 'failed' : wasInterrupted ? 'interrupted' : item.status,
          error: missingResult ? '历史成品缓存不可用，继续时会优先恢复原生图结果。'
            : requiresRecovery ? '继续时会核对原生图任务，不会重复提交。'
              : wasInterrupted ? undefined : item.error,
        } satisfies PosterItem;
      }));
      if (!aliveRef.current || !ensureWorkspaceReady()) return false;
      releaseRecoveredResultUrls();
      recoveredResultUrlsRef.current = restoredUrls;
      activeBatchIdRef.current = latestRecord.id;
      activeBatchCreatedAtRef.current = latestRecord.createdAt;
      activeBatchRevisionRef.current = latestRecord.revision || String(latestRecord.updatedAt);
      persistedMediaKeysRef.current = new Set(restored.flatMap((item) => item.resultUrl && item.persistedResultKey ? [item.persistedResultKey] : []));
      itemsRef.current = restored;
      setItemsIfAlive(restored);
      setPreviewState(null);
      const settings = latestRecord.settings;
      setImageModel(settings.imageModel);
      setTitleModel(settings.titleModel);
      setTitleHandling(settings.titleHandling);
      setImageQuality(settings.imageQuality);
      setConcurrency(normalizeConcurrency(settings.concurrency));
      setNoticeIfAlive(`已恢复历史批次及生产设置，共 ${restored.length} 条；中断生图会先核对原任务。`);
      return true;
    } finally {
      if (!aliveRef.current || recoveredResultUrlsRef.current !== restoredUrls) {
        for (const url of restoredUrls) URL.revokeObjectURL(url);
      }
      restoringRef.current = false;
      if (aliveRef.current) setIsRestoring(false);
    }
  };

  const restoreHistoryBatch = async (record: PosterBatchRecord): Promise<boolean> => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    return withOwnedBatchLock(record.id, () => restoreHistoryBatchInternal(record), () => {
      setNoticeIfAlive('另一个页面正在处理此历史批次，请等待结束后再恢复。');
      return false;
    });
  };

  const deleteHistoryBatch = async (id: string) => {
    if (id === activeBatchIdRef.current || runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    const scope = workspaceScopeRef.current!;
    const next = await withOwnedBatchLock(id, () => withHistoryWriteLock(scope, () => removePosterBatchRecord(id, scope)), () => {
      throw new Error('另一个页面正在处理此历史批次，请等待结束后再删除。');
    });
    if (!next.saved) throw new Error('历史批次删除未保存，成品缓存已保留；请检查浏览器存储后重试。');
    if (aliveRef.current) setHistoryBatches(next.records);
    await removeResultCaches(next.removedResultCacheKeys);
  };

  const clearItems = async (): Promise<boolean> => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    if (activeBatchIdRef.current && !activeBatchIsCurrent()) return false;
    restoringRef.current = true;
    setIsRestoring(true);
    try {
      if (!await persistActiveBatch(itemsRef.current)) {
        setNoticeIfAlive('当前批次未保存成功，已保留所有记录；请先下载成品或释放浏览器存储。');
        return false;
      }
      if (!aliveRef.current || !ensureWorkspaceReady()) return false;
      abortRef.current.aborted = true;
      abortAllItems();
      releaseRecoveredResultUrls();
      itemsRef.current = [];
      activeBatchIdRef.current = null;
      activeBatchCreatedAtRef.current = null;
      activeBatchRevisionRef.current = null;
      persistedMediaKeysRef.current.clear();
      setItemsIfAlive([]);
      setPreviewState(null);
      setNoticeIfAlive('已创建新批次，可以导入新的图片链接和标题。生产设置已保留。');
      return true;
    } finally {
      restoringRef.current = false;
      if (aliveRef.current) setIsRestoring(false);
    }
  };

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

  const runItemInternal = async (requestedItem: PosterItem, index: number, fromBatch = false, settings = currentSettings()) => {
    if (!aliveRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    if (activeItemsRef.current.has(requestedItem.id) || !fromBatch && runningRef.current) return;
    if (fromBatch && isAborted()) return;
    const item = itemsRef.current.find((candidate) => candidate.id === requestedItem.id);
    if (!item) return;
    if (item.status === 'complete' && item.resultUrl) return;
    const recoveringImage = Boolean(item.imageTaskId || item.generatedSceneUrl || item.generationRecoveryRequired);
    const inputError = !recoveringImage && (item.importError || posterInputError(item) || productionModelError(settings));
    if (inputError) {
      updateItem(item.id, { status: 'failed', error: inputError });
      setNoticeIfAlive(inputError);
      return;
    }
    if (!fromBatch) {
      abortRef.current.aborted = false;
      setIsRunningIfAlive(true);
    }
    const signal = signalForItem(item.id);
    const itemAborted = () => !aliveRef.current || isAborted() || signal.aborted;
    let imageRequestStarted = false;
    activeItemsRef.current.add(item.id);
    const attempt = { recovering: recoveringImage, dispatched: false };
    activeAttemptsRef.current.set(item.id, attempt);
    try {
      const shouldRewriteTitle = !recoveringImage && shouldRewriteCoverTitle(item, settings.titleHandling);
      updateItem(item.id, { status: shouldRewriteTitle ? 'rewriting' : 'prompting', error: undefined, modelFallbackNote: undefined, resultUrl: undefined });

      const modelLabel = (modelId: string) => {
        const model = availableTitleModelsRef.current.find((candidate) => candidate.id === modelId);
        return model?.shortName || model?.name || modelId;
      };
      const runWithModelFallback = async <T,>(
        stage: '标题改写' | '封面设计',
        status: 'rewriting' | 'prompting',
        preferredModel: string,
        request: (modelId: string) => Promise<T>,
      ): Promise<{ value: T; modelId: string; fallbackNote?: string }> => {
        try {
          return { value: await request(preferredModel), modelId: preferredModel };
        } catch (error) {
          if (itemAborted()) throw error;
          updateItem(item.id, { status });
          const reason = error instanceof Error ? error.message : '未知错误';
          throw new Error(`${stage}模型 ${modelLabel(preferredModel)} 请求结果不确定，已停止自动切换：${reason}`);
        }
      };

      const titleResult = shouldRewriteTitle
        ? await runWithModelFallback('标题改写', 'rewriting', settings.titleModel, (modelId) => rewriteCoverTitle(item, modelId, signal))
        : {
          value: recoveringImage ? item.coverTitle : item.isTitleEdited ? normalizeCoverTitle(item.coverTitle) : preservedOriginalTitle(item),
          modelId: settings.titleModel,
        };
      const coverTitle = titleResult.value;
      if (itemAborted()) throw new Error('已取消大字报任务');
      if (!recoveringImage && (shouldRewriteTitle || item.isTitleEdited) && (coverTitle.length < 7 || coverTitle.length > 12)) {
        throw new Error('封面标题请保持 7–12 字；不会自动截断词语');
      }
      updateItem(item.id, { status: 'prompting', coverTitle, modelFallbackNote: titleResult.fallbackNote });

      let designPlan = item.designPlan;
      let prompt = item.prompt;
      if (!recoveringImage) {
        const occurrence = itemsRef.current.slice(0, index).filter((row) => sourceKey(row.sourceImageUrl) === sourceKey(item.sourceImageUrl)).length;
        const artDirection = reservedArtDirectionFor(item.sourceImageUrl, occurrence);
        const currentStyle = getAllCoverStyles().find((s) => s.id === activeStyleIdRef.current);
        const styleCorrections = getStyleCorrections(activeStyleIdRef.current).map((c) => c.negativeRule);
        const mergedNegativeRules = [...(currentStyle?.negativeRules || []), ...styleCorrections];
        const directorResult = await runWithModelFallback(
          '封面设计', 'prompting', titleResult.modelId,
          (modelId) => directCoverDesign(item, coverTitle, artDirection, modelId, {
            stylePrompt: currentStyle?.directorPrompt,
            negativeRules: mergedNegativeRules,
            signal,
          }),
        );
        if (itemAborted()) throw new Error('已取消大字报任务');
        designPlan = buildDesignPlan(coverTitle, directorResult.value);
        prompt = designPlan.generationDirection;
        logMemoryAudit({
          styleName: currentStyle?.name || '默认风格',
          itemTitle: item.originalTitle || item.productName || '商品封面',
          adoptedRules: [
            directorResult.value.composition || '居中咬合构图',
            directorResult.value.typography || '粗黑字效',
          ].filter(Boolean),
          blockedNegatives: mergedNegativeRules.slice(0, 3),
        });
        updateItem(item.id, {
          status: 'prompting', coverTitle, prompt, designPlan, promptVersion: 'integrated-cover-v4',
          modelFallbackNote: directorResult.fallbackNote || titleResult.fallbackNote,
        });
      }
      const submissionKey = item.imageSubmissionKey || (!recoveringImage ? `headline:${ensureActiveBatch()}:${item.id}:${makeId()}` : undefined);
      updateItem(item.id, { status: 'rendering', imageSubmissionKey: submissionKey, generationRecoveryRequired: true });
      // Save the operation key before any billable submission is dispatched.
      if (!await persistActiveBatch() && !recoveringImage) throw new Error('无法保存原任务查询标识，已停止本次生图；请释放浏览器存储后重试。');
      if (itemAborted()) throw new Error('已取消大字报任务');
      imageRequestStarted = true;
      attempt.dispatched = true;
      const resultUrl = await generateFinalCover(
        item.sourceImageUrl, item.originalTitle, coverTitle, item.productName, item.format,
        designPlan, prompt, settings.imageModel, settings.imageQuality, itemAborted,
        {
          taskId: item.imageTaskId, submissionKey, sceneUrl: item.generatedSceneUrl,
          required: item.generationRecoveryRequired, signal,
          onTaskSubmitted: (imageTaskId) => updateItem(item.id, { imageTaskId }),
          onSceneGenerated: (generatedSceneUrl) => updateItem(item.id, { generatedSceneUrl }),
        },
      );
      if (itemAborted()) {
        if (resultUrl.startsWith('blob:')) URL.revokeObjectURL(resultUrl);
        throw new Error('已取消大字报任务');
      }
      updateItem(item.id, { status: 'complete', resultUrl, generationRecoveryRequired: false });
    } catch (error) {
      if (itemAborted()) {
        // AbortError may be reported as “signal is aborted without reason” by
        // the browser/runtime. It is an interruption, never a generation
        // failure, and must not overwrite the recoverable batch snapshot.
        updateItem(item.id, {
          status: 'interrupted',
          ...(!imageRequestStarted && !recoveringImage ? { imageSubmissionKey: undefined, generationRecoveryRequired: false } : {}),
          error: imageRequestStarted || recoveringImage ? '已停止等待，继续时会核对原生图任务。' : undefined,
          modelFallbackNote: undefined,
        });
        return;
      }
      const current = itemsRef.current.find((row) => row.id === item.id);
      const definiteFailure = error instanceof Error && (error.name === 'ImageGenBusinessError'
        || 'retryable' in error && error.retryable === false && !requiresGenerationRecovery(error));
      const recoveryRequired = !definiteFailure && (requiresGenerationRecovery(error)
        || Boolean(current?.imageTaskId || current?.generatedSceneUrl)
        || Boolean(current?.generationRecoveryRequired && (imageRequestStarted || recoveringImage)));
      updateItem(item.id, {
        status: 'failed', generationRecoveryRequired: recoveryRequired,
        ...(definiteFailure || !recoveryRequired ? { imageTaskId: undefined, imageSubmissionKey: undefined, generatedSceneUrl: undefined } : {}),
        error: error instanceof Error ? error.message : '生成任务异常，请稍后重试',
      });
    } finally {
      if (aliveRef.current) await persistActiveBatch();
      activeItemsRef.current.delete(item.id);
      activeAttemptsRef.current.delete(item.id);
      itemAbortControllers.current.delete(item.id);
      if (!fromBatch) setIsRunningIfAlive(false);
    }
  };

  const withBatchGenerationLock = async (operation: () => Promise<void>, hasNewGeneration: boolean) => {
    // Imports may still be finishing their durable snapshot when the next UI
    // action begins. Wait for our own save before requesting the generation lock.
    await metadataBarrierRef.current;
    if (!ensureWorkspaceReady() || !activeBatchIdRef.current || !activeBatchIsCurrent()) return;
    if (!globalThis.navigator?.locks) {
      if (hasNewGeneration) {
        setNoticeIfAlive('浏览器不支持跨页面任务保护，请使用新版浏览器生成；已有原生图仍可恢复和下载。');
        return;
      }
      await operation();
      return;
    }
    await withOwnedBatchLock(activeBatchIdRef.current, async () => {
      if (ensureWorkspaceReady() && activeBatchIsCurrent()) await operation();
    }, () => { setNoticeIfAlive('另一个页面正在处理此批次，请等待它结束后再打开历史批次。'); })
      .catch((error) => setNoticeIfAlive(`任务保护锁不可用，已停止本次操作：${error instanceof Error ? error.message : '请刷新页面重试。'}`));
  };

  const runItem = async (item: PosterItem, index: number) => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current) return;
    await withBatchGenerationLock(() => runItemInternal(item, index), !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired);
  };

  const runBatchInternal = async (onlyFailed = false) => {
    if (!aliveRef.current || runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    const settings = currentSettings();
    const queue = itemsRef.current.filter((item) => onlyFailed
      ? item.status === 'failed' && (!item.importError || item.imageTaskId || item.generatedSceneUrl || item.generationRecoveryRequired)
      : item.status === 'idle' || item.status === 'interrupted');
    if (queue.length === 0) {
      setNoticeIfAlive(onlyFailed ? '没有可重试的失败记录。' : '没有待生成任务；请先导入图片链接、原标题和文字竖/文字横。');
      return;
    }
    const modelError = productionModelError(settings);
    if (modelError && queue.every((item) => !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired)) {
      setNoticeIfAlive(modelError);
      return;
    }
    abortRef.current.aborted = false;
    setIsRunningIfAlive(true);
    const indices = new Map(itemsRef.current.map((item, index) => [item.id, index]));
    const pending = queue.map((item) => ({ item, index: indices.get(item.id)! }));
    let cursor = 0;
    setNoticeIfAlive(`正在处理 ${queue.length} 条任务：每条依次进行标题改写、封面提示词设计、一次生图直接完成商品、场景与艺术字排版。`);
    try {
      await Promise.all(Array.from({ length: Math.min(settings.concurrency, pending.length) }, async () => {
        while (cursor < pending.length && !isAborted()) {
          const next = pending[cursor++];
          if (next) await runItemInternal(next.item, next.index, true, settings);
        }
      }));
      setNoticeIfAlive(isAborted() ? '已停止等待；继续生成会先核对已提交的原生图任务。' : '本轮任务已结束。可检查标题与提示词，并下载成功成品。');
    } finally {
      setIsRunningIfAlive(false);
    }
  };

  const runBatch = async (onlyFailed = false) => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current) return;
    const hasNewGeneration = itemsRef.current.some((item) => (onlyFailed ? item.status === 'failed' && !item.importError : ['idle', 'interrupted'].includes(item.status))
      && !item.imageTaskId && !item.generatedSceneUrl && !item.generationRecoveryRequired);
    await withBatchGenerationLock(() => runBatchInternal(onlyFailed), hasNewGeneration);
  };

  const exportZip = async () => {
    if (runningRef.current || exportingRef.current || restoringRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    const ready = itemsRef.current.filter((item) => item.status === 'complete' && item.resultUrl);
    if (ready.length === 0) return;
    setIsExportingIfAlive(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const entries = ready.map((item, index) => {
        const base = safeBaseName(item.originalTitle, `大字报封面_${index + 1}`);
        let name = base;
        let duplicate = 2;
        while (usedNames.has(name.toLowerCase())) name = `${base}_${duplicate++}`;
        usedNames.add(name.toLowerCase());
        return { item, name };
      });
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (cursor < entries.length) {
          if (!aliveRef.current || workspaceChanged()) throw new Error('页面或工作区已切换，请在原批次重新导出。');
          const { item, name } = entries[cursor++];
          zip.file(`${name}.jpg`, await fetchMediaBlob(item.resultUrl!), { binary: true });
        }
      }));
      const csvCell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
      zip.file('生成记录.csv', '\uFEFF' + ['原标题,商品名称/型号,封面标题,状态', ...ready.map((item) => [item.originalTitle, item.productName, item.coverTitle, '已完成'].map(csvCell).join(','))].join('\r\n'));
      zip.file('完整设计与提示词.json', JSON.stringify(ready.map((item) => ({
        originalTitle: item.originalTitle, productName: item.productName, coverTitle: item.coverTitle,
        outputFormat: item.format.importValue,
        outputSize: item.format.width + 'x' + item.format.height,
        sourceImageUrl: item.sourceImageUrl, design: item.designPlan,
        imagePrompt: item.prompt, promptVersion: item.promptVersion || 'legacy-unknown',
      })), null, 2));
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      if (!aliveRef.current || !ensureWorkspaceReady()) return;
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await saveToDownloadDir(`大字报封面_${date}.zip`, archive);
      setNoticeIfAlive('成果包已开始下载，图片均按原标题命名。');
    } catch (error) {
      setNoticeIfAlive(`打包失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExportingIfAlive(false);
    }
  };

  const downloadOne = async (item: PosterItem, index: number) => {
    if (!item.resultUrl || !ensureWorkspaceReady()) return;
    try {
      await saveToDownloadDir(`${safeBaseName(item.originalTitle, `大字报封面_${index + 1}`)}.jpg`, await fetchMediaBlob(item.resultUrl));
      setNoticeIfAlive('已按原标题保存成品。');
    } catch (error) {
      setNoticeIfAlive(`下载失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const downloadOriginalScene = async (item: PosterItem, index: number) => {
    if (!item.generatedSceneUrl || !ensureWorkspaceReady()) return;
    try {
      const blob = await fetchMediaBlob(item.generatedSceneUrl);
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' } as Record<string, string>)[blob.type];
      if (!extension) throw new Error('原生图格式无法确认，请在资产中心下载原任务结果。');
      await saveToDownloadDir(`${safeBaseName(item.originalTitle, `大字报封面_${index + 1}`)}_原生图.${extension}`, blob);
      setNoticeIfAlive('已保存原生图，可检查比例或直接使用原图。');
    } catch (error) {
      setNoticeIfAlive(`原生图下载失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return {
    fileInputRef,
    pasteText, setPasteText,
    importMode, setImportMode,
    isDraggingFile, setIsDraggingFile,
    items, isReady, isRunning, isImporting, isRestoring, isExporting, notice,
    availableImageModels, availableTitleModels,
    imageModel, titleModel, titleHandling, imageQuality, concurrency,
    activeStyleId, setActiveStyleId, styles: getAllCoverStyles(),
    isSettingsOpen, settingsDraft, setSettingsDraft,
    previewState, setPreviewState, previewItem, previewImages,
    completedCount, failedCount, historyBatches, activeBatchId: activeBatchIdRef.current,
    openProductionSettings, closeProductionSettings, saveProductionSettings,
    importFile, handleFileDrop, importPaste, clearItems, restoreHistoryBatch, deleteHistoryBatch,
    updateItem, editCoverTitle, runItem, runBatch, stopBatch, exportZip, downloadOne, downloadOriginalScene,
  };
}
