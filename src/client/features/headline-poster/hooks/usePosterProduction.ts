/* eslint-disable max-lines -- Batch production and recovery share one state machine. */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { deleteDerived, getDerived, putDerived } from '@client/shared/media/idbMediaCache';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { isOpenAIModelRouteId } from '@shared/domain/models/workflowModels';
import { reservedArtDirectionFor, sourceKey } from '../model/reservedArtDirections';
import { directCoverDesign, generateFinalCover, rewriteCoverTitle } from '../api/posterApi';
import { parseTable } from '../model/parsePosterTable';
import { mergePosterItems } from '../model/mergePosterItems';
import { loadPosterProductionSettings, persistPosterProductionSettings } from '../model/posterSettings';
import {
  loadPosterBatchHistory,
  persistPosterBatchRecord,
  removePosterBatchRecord,
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
  safeBaseName,
  shouldRewriteCoverTitle,
  type ImageQuality,
  type PosterItem,
  type PosterProductionSettings,
} from '../model/posterTypes';

export function usePosterProduction() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemsRef = useRef(new Set<string>());
  const aliveRef = useRef(true);
  const interruptActiveRef = useRef<() => void>(() => {});
  const abortRef = useRef({ aborted: false });
  const itemAbortControllers = useRef(new Map<string, AbortController>());
  const [pasteText, setPasteText] = useState('');
  const [importMode, setImportMode] = useState<'file' | 'paste'>('paste');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [items, setItems] = useState<PosterItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [availableImageModels, setAvailableImageModels] = useState<Array<{ id: string; name?: string; shortName?: string }>>([]);
  const [availableTitleModels, setAvailableTitleModels] = useState<Array<{ id: string; name?: string; shortName?: string }>>([]);
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [titleModel, setTitleModel] = useState('gemini-3.7-flash');
  const [titleHandling, setTitleHandling] = useState<PosterProductionSettings['titleHandling']>('rewrite');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('high');
  const [concurrency, setConcurrency] = useState<number>(POSTER_CONCURRENCY_OPTIONS[0]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<PosterProductionSettings | null>(null);
  const [previewState, setPreviewState] = useState<{ itemId: string; index: number } | null>(null);
  const [historyBatches, setHistoryBatches] = useState<PosterBatchRecord[]>([]);
  const itemsRef = useRef(items);
  const titleModelRef = useRef(titleModel);
  const availableTitleModelsRef = useRef(availableTitleModels);
  const titleHandlingRef = useRef(titleHandling);
  const imageModelRef = useRef(imageModel);
  const imageQualityRef = useRef(imageQuality);
  const activeBatchIdRef = useRef<string | null>(null);
  const activeBatchCreatedAtRef = useRef<number | null>(null);
  const persistedMediaKeysRef = useRef(new Set<string>());
  const recoveredResultUrlsRef = useRef<string[]>([]);
  itemsRef.current = items;
  titleModelRef.current = titleModel;
  availableTitleModelsRef.current = availableTitleModels;
  titleHandlingRef.current = titleHandling;
  imageModelRef.current = imageModel;
  imageQualityRef.current = imageQuality;

  useEffect(() => {
    const interruptActive = () => interruptActiveRef.current();
    const abortState = abortRef.current;
    const controllers = itemAbortControllers.current;
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
      for (const url of recoveredResultUrlsRef.current) URL.revokeObjectURL(url);
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
    if (aliveRef.current) setIsRunning(value);
  };
  const setIsExportingIfAlive = (value: boolean) => {
    if (aliveRef.current) setIsExporting(value);
  };

  const currentSettings = (): PosterProductionSettings => ({
    imageModel: imageModelRef.current,
    titleModel: titleModelRef.current,
    titleHandling: titleHandlingRef.current,
    imageQuality: imageQualityRef.current,
    concurrency,
  });

  const ensureActiveBatch = () => {
    if (activeBatchIdRef.current) return activeBatchIdRef.current;
    activeBatchIdRef.current = `poster_batch_${makeId()}`;
    activeBatchCreatedAtRef.current = Date.now();
    persistedMediaKeysRef.current.clear();
    return activeBatchIdRef.current;
  };

  const releaseRecoveredResultUrls = () => {
    for (const url of recoveredResultUrlsRef.current) URL.revokeObjectURL(url);
    recoveredResultUrlsRef.current = [];
  };

  const persistActiveBatch = async (targetItems = itemsRef.current) => {
    const batchId = activeBatchIdRef.current;
    if (!batchId || targetItems.length === 0) return;
    const mediaWrites: Promise<void>[] = [];
    const snapshotItems: PosterBatchSnapshotItem[] = targetItems.map((item) => {
      const { resultUrl, ...rest } = item;
      const resultCacheKey = resultUrl ? `headline_poster_result:${batchId}:${item.id}` : undefined;
      if (resultUrl && (resultUrl.startsWith('data:') || resultUrl.startsWith('blob:')) && resultCacheKey && !persistedMediaKeysRef.current.has(resultCacheKey)) {
        mediaWrites.push(fetchMediaBlob(resultUrl)
          .then((blob) => putDerived(resultCacheKey, blob, blob.type || 'image/jpeg'))
          .then(() => { persistedMediaKeysRef.current.add(resultCacheKey); })
          .catch(() => undefined));
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
      settings: currentSettings(),
      items: snapshotItems,
    };
    const nextHistory = persistPosterBatchRecord(record);
    if (aliveRef.current) setHistoryBatches(nextHistory);
    await Promise.all(mediaWrites);
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
    const configured = loadSystemConfiguredModels();
    const saved = loadPosterProductionSettings();
    const titleModels = configured.availableVisionModels.filter(model => !isOpenAIModelRouteId(model.id));
    setHistoryBatches(loadPosterBatchHistory());
    setAvailableImageModels(configured.availableImageModels);
    setAvailableTitleModels(titleModels);
    setImageModel(saved.imageModel || configured.selectedImageGenModel);
    setTitleModel(titleModels.find(model => model.id === saved.titleModel)?.id || titleModels[0]?.id || 'gemini-3.7-flash');
    setTitleHandling(saved.titleHandling || 'rewrite');
    setImageQuality(saved.imageQuality || 'high');
    setConcurrency(normalizeConcurrency(saved.concurrency));
  }, []);

  useEffect(() => {
    const refreshConfiguredModels = () => {
      const configured = loadSystemConfiguredModels();
      const titleModels = configured.availableVisionModels.filter(model => !isOpenAIModelRouteId(model.id));
      setAvailableImageModels(configured.availableImageModels);
      setAvailableTitleModels(titleModels);
      setImageModel((current) => configured.availableImageModels.some((model) => model.id === current)
        ? current
        : configured.selectedImageGenModel);
      setTitleModel((current) => titleModels.some((model) => model.id === current)
        ? current
        : titleModels[0]?.id || 'gemini-3.7-flash');
    };
    window.addEventListener('models_updated', refreshConfiguredModels);
    return () => window.removeEventListener('models_updated', refreshConfiguredModels);
  }, []);

  useEffect(() => {
    if (!activeBatchIdRef.current || items.length === 0) return undefined;
    const timer = window.setTimeout(() => { void persistActiveBatch(items); }, 220);
    return () => window.clearTimeout(timer);
    // The snapshot must be refreshed for every item and production-setting change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, imageModel, titleModel, titleHandling, imageQuality, concurrency]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
        setSettingsDraft(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isSettingsOpen]);

  const openProductionSettings = () => {
    setSettingsDraft({ imageModel, titleModel, titleHandling, imageQuality, concurrency });
    setIsSettingsOpen(true);
  };

  const closeProductionSettings = () => {
    setIsSettingsOpen(false);
    setSettingsDraft(null);
  };

  const saveProductionSettings = () => {
    if (!settingsDraft) return;
    const next = { ...settingsDraft, concurrency: normalizeConcurrency(settingsDraft.concurrency) };
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
  const failedCount = useMemo(() => items.filter((item) => item.status === 'failed').length, [items]);
  const previewItem = useMemo(() => previewState ? items.find((item) => item.id === previewState.itemId) ?? null : null, [items, previewState]);
  const previewImages = useMemo(() => previewItem ? Array.from(new Set([
    previewItem.sourceImageUrl,
    previewItem.resultUrl,
  ].filter((url): url is string => Boolean(url)))) : [], [previewItem]);

  const updateItem = (id: string, patch: Partial<PosterItem>) => {
    if ('resultUrl' in patch) persistedMediaKeysRef.current.delete(`headline_poster_result:${activeBatchIdRef.current}:${id}`);
    const next = itemsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item);
    itemsRef.current = next;
    setItemsIfAlive(next);
    if (patch.status === 'complete' || patch.status === 'failed' || patch.status === 'interrupted' || patch.resultUrl) void persistActiveBatch(next);
  };

  /**
   * Cancellation must never be serialized as a failed model request. Keeping a
   * first-class interrupted state also makes an in-app stop immediately clear
   * instead of leaving cards stuck in a loading stage.
   */
  const markActiveItemsInterrupted = () => {
    if (activeItemsRef.current.size === 0) return;
    const activeIds = activeItemsRef.current;
    const next = itemsRef.current.map((item) => activeIds.has(item.id)
      ? {
        ...item,
        status: 'interrupted' as const,
        error: undefined,
        modelFallbackNote: undefined,
      }
      : item);
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
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setNoticeIfAlive('仅支持导入 .xlsx、.xls 或 .csv 文件。');
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('文件中没有可读取的工作表');
      appendParsedRows(XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' }));
    } catch (error) {
      setNoticeIfAlive(`导入失败：${error instanceof Error ? error.message : '文件格式无法识别'}`);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await importUploadFile(file);
    event.target.value = '';
  };

  const handleFileDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importUploadFile(file);
  };

  const importPaste = () => {
    const rows = pasteText.split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
    const parsed = parseTable(rows);
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

  const restoreHistoryBatch = async (record: PosterBatchRecord) => {
    abortRef.current.aborted = true;
    abortAllItems();
    activeItemsRef.current.clear();
    releaseRecoveredResultUrls();
    const restored = await Promise.all(record.items.map(async (snapshot) => {
      const { resultCacheKey, resultUrl: savedResultUrl, ...item } = snapshot;
      let resultUrl = savedResultUrl;
      if (resultCacheKey) {
        const blob = await getDerived(resultCacheKey);
        if (blob) {
          resultUrl = URL.createObjectURL(blob);
          recoveredResultUrlsRef.current.push(resultUrl);
        }
      }
      const wasInterrupted = item.status === 'rewriting'
        || item.status === 'prompting'
        || item.status === 'rendering'
        || item.status === 'interrupted';
      const missingResult = item.status === 'complete' && !resultUrl;
      return {
        ...item,
        resultUrl,
        persistedResultKey: resultCacheKey,
        status: missingResult ? 'failed' : wasInterrupted ? 'idle' : item.status,
        error: missingResult
          ? '历史成品的本地缓存不可用，请重新生成。'
          : wasInterrupted ? undefined : item.error,
      } satisfies PosterItem;
    }));
    activeBatchIdRef.current = record.id;
    activeBatchCreatedAtRef.current = record.createdAt;
    persistedMediaKeysRef.current = new Set(record.items.flatMap((item) => item.resultCacheKey ? [item.resultCacheKey] : []));
    itemsRef.current = restored;
    setItemsIfAlive(restored);
    setIsRunningIfAlive(false);
    const interruptedCount = record.items.filter((item) => item.status === 'rewriting'
      || item.status === 'prompting'
      || item.status === 'rendering'
      || item.status === 'interrupted').length;
    setNoticeIfAlive(interruptedCount > 0
      ? `已恢复历史批次；${interruptedCount} 条中断任务已回到待开始状态，可继续生成。`
      : `已恢复历史批次，共 ${restored.length} 条记录。`);
  };

  const deleteHistoryBatch = async (id: string) => {
    if (id === activeBatchIdRef.current) return;
    const target = historyBatches.find((record) => record.id === id);
    if (target) await Promise.all(target.items.map((item) => item.resultCacheKey ? deleteDerived(item.resultCacheKey) : undefined));
    const next = removePosterBatchRecord(id);
    if (aliveRef.current) setHistoryBatches(next);
  };

  const clearItems = () => {
    void persistActiveBatch(itemsRef.current);
    abortRef.current.aborted = true;
    abortAllItems();
    releaseRecoveredResultUrls();
    itemsRef.current = [];
    activeBatchIdRef.current = null;
    activeBatchCreatedAtRef.current = null;
    persistedMediaKeysRef.current.clear();
    setIsRunningIfAlive(false);
    setItemsIfAlive([]);
    if (aliveRef.current) setPreviewState(null);
    setNoticeIfAlive('已创建新批次，可以导入新的图片链接和标题。生产设置已保留。');
  };

  const isAborted = () => abortRef.current.aborted;

  const stopBatch = () => {
    if (!isRunning) return;
    abortRef.current.aborted = true;
    markActiveItemsInterrupted();
    abortAllItems();
    setIsRunningIfAlive(false);
    setNoticeIfAlive('已停止本轮任务；进行中的条目已标记为可继续生成。');
  };

  const runItem = async (item: PosterItem, index: number, fromBatch = false) => {
    if (activeItemsRef.current.has(item.id)) return;
    if (fromBatch && isAborted()) return;
    if (!fromBatch) abortRef.current.aborted = false;
    const signal = signalForItem(item.id);
    const itemAborted = () => abortRef.current.aborted || signal.aborted;
    if (!/^https?:\/\//i.test(item.sourceImageUrl)) {
      updateItem(item.id, { status: 'failed', error: '图片链接必须以 http:// 或 https:// 开头' });
      return;
    }
    if (!item.originalTitle.trim()) {
      updateItem(item.id, { status: 'failed', error: '缺少原标题，无法用于命名与标题优化' });
      return;
    }

    activeItemsRef.current.add(item.id);
    try {
      const shouldRewriteTitle = shouldRewriteCoverTitle(item, titleHandlingRef.current);
      updateItem(item.id, { status: shouldRewriteTitle ? 'rewriting' : 'prompting', error: undefined, modelFallbackNote: undefined, resultUrl: undefined, prompt: undefined, promptVersion: undefined, designPlan: undefined });

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
        ? await runWithModelFallback('标题改写', 'rewriting', titleModelRef.current, (modelId) => rewriteCoverTitle(item, modelId, signal))
        : {
          value: item.isTitleEdited ? normalizeCoverTitle(item.coverTitle) : preservedOriginalTitle(item),
          modelId: titleModelRef.current,
        };
      const coverTitle = titleResult.value;
      if (itemAborted()) throw new Error('已取消大字报任务');
      if ((shouldRewriteTitle || item.isTitleEdited) && (coverTitle.length < 7 || coverTitle.length > 12)) {
        throw new Error('封面标题请保持 7–12 字；不会自动截断词语');
      }
      updateItem(item.id, { status: 'prompting', coverTitle, modelFallbackNote: titleResult.fallbackNote });

      const occurrence = itemsRef.current.slice(0, index).filter((row) => sourceKey(row.sourceImageUrl) === sourceKey(item.sourceImageUrl)).length;
      const artDirection = reservedArtDirectionFor(item.sourceImageUrl, occurrence);
      const directorResult = await runWithModelFallback(
        '封面设计',
        'prompting',
        titleResult.modelId,
        (modelId) => directCoverDesign(item, coverTitle, artDirection, modelId, signal),
      );
      const director = directorResult.value;
      if (itemAborted()) throw new Error('已取消大字报任务');
      const designPlan = buildDesignPlan(coverTitle, director);
      const prompt = designPlan.generationDirection;
      updateItem(item.id, {
        status: 'prompting', coverTitle, prompt, designPlan, promptVersion: 'integrated-cover-v3',
        modelFallbackNote: directorResult.fallbackNote || titleResult.fallbackNote,
      });

      updateItem(item.id, { status: 'rendering' });
      const resultUrl = await generateFinalCover(
        item.sourceImageUrl,
        item.originalTitle,
        coverTitle,
        item.productName,
        item.format,
        designPlan,
        prompt,
        imageModelRef.current,
        imageQualityRef.current,
        itemAborted,
      );
      if (itemAborted()) throw new Error('已取消大字报任务');
      updateItem(item.id, { status: 'complete', resultUrl });
    } catch (error) {
      if (itemAborted()) {
        // AbortError may be reported as “signal is aborted without reason” by
        // the browser/runtime. It is an interruption, never a generation
        // failure, and must not overwrite the recoverable batch snapshot.
        updateItem(item.id, {
          status: 'interrupted',
          error: undefined,
          modelFallbackNote: undefined,
        });
        return;
      }
      updateItem(item.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : '生成任务异常，请稍后重试',
      });
    } finally {
      activeItemsRef.current.delete(item.id);
      itemAbortControllers.current.delete(item.id);
    }
  };

  const runBatch = async (onlyFailed = false) => {
    const queue = itemsRef.current.filter((item) => onlyFailed
      ? item.status === 'failed'
      : item.status === 'idle' || item.status === 'interrupted');
    if (queue.length === 0) {
      setNoticeIfAlive(onlyFailed ? '没有可重试的失败记录。' : '没有待生成任务；请先导入图片链接、原标题和文字竖/文字横。');
      return;
    }
    abortRef.current.aborted = false;
    setIsRunningIfAlive(true);
    const pending = queue.map((item) => ({ item, index: itemsRef.current.findIndex((row) => row.id === item.id) }));
    setNoticeIfAlive(`正在处理 ${queue.length} 条任务：每条依次进行标题改写、封面提示词设计、一次生图直接完成商品、场景与艺术字排版。`);
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (pending.length > 0 && !isAborted()) {
        const next = pending.shift();
        if (next) await runItem(next.item, next.index, true);
      }
    }));
    setIsRunningIfAlive(false);
    setNoticeIfAlive(isAborted() ? '已停止后续任务。' : '本轮任务已结束。可检查标题与提示词，并下载成功成品。');
  };

  const exportZip = async () => {
    const ready = items.filter((item) => item.status === 'complete' && item.resultUrl);
    if (ready.length === 0) return;
    setIsExportingIfAlive(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      await Promise.all(ready.map(async (item, index) => {
        const base = safeBaseName(item.originalTitle, `大字报封面_${index + 1}`);
        let name = base;
        let duplicate = 2;
        while (usedNames.has(name)) name = `${base}_${duplicate++}`;
        usedNames.add(name);
        zip.file(`${name}.jpg`, await fetchMediaBlob(item.resultUrl!), { binary: true });
      }));
      zip.file('生成记录.csv', ['原标题,商品名称/型号,封面标题,状态', ...ready.map((item) => `"${item.originalTitle.replace(/"/g, '""')}","${item.productName.replace(/"/g, '""')}","${item.coverTitle.replace(/"/g, '""')}",已完成`)].join('\n'));
      zip.file('完整设计与提示词.json', JSON.stringify(ready.map((item) => ({
        originalTitle: item.originalTitle, productName: item.productName, coverTitle: item.coverTitle,
        outputFormat: item.format.importValue,
        outputSize: item.format.width + 'x' + item.format.height,
        sourceImageUrl: item.sourceImageUrl, design: item.designPlan,
        imagePrompt: item.prompt, promptVersion: item.promptVersion || 'legacy-unknown',
      })), null, 2));
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      await saveToDownloadDir(`大字报封面_${new Date().toISOString().slice(0, 10)}.zip`, archive);
      setNoticeIfAlive('成果包已开始下载，图片均按原标题命名。');
    } catch (error) {
      setNoticeIfAlive(`打包失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExportingIfAlive(false);
    }
  };

  const downloadOne = async (item: PosterItem, index: number) => {
    if (!item.resultUrl) return;
    try {
      await saveToDownloadDir(`${safeBaseName(item.originalTitle, `大字报封面_${index + 1}`)}.jpg`, await fetchMediaBlob(item.resultUrl));
      setNoticeIfAlive('已按原标题保存成品。');
    } catch (error) {
      setNoticeIfAlive(`下载失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return {
    fileInputRef,
    pasteText, setPasteText,
    importMode, setImportMode,
    isDraggingFile, setIsDraggingFile,
    items, isRunning, isExporting, notice,
    availableImageModels, availableTitleModels,
    imageModel, titleModel, titleHandling, imageQuality, concurrency,
    isSettingsOpen, settingsDraft, setSettingsDraft,
    previewState, setPreviewState, previewItem, previewImages,
    completedCount, failedCount, historyBatches, activeBatchId: activeBatchIdRef.current,
    openProductionSettings, closeProductionSettings, saveProductionSettings,
    importFile, handleFileDrop, importPaste, clearItems, restoreHistoryBatch, deleteHistoryBatch,
    updateItem, runItem, runBatch, stopBatch, exportZip, downloadOne,
  };
}
