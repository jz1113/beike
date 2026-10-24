import { useCallback, useRef, useState } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import type { PosterBatchRecord } from '../model/posterBatchHistory';
import { POSTER_CONCURRENCY_OPTIONS } from '../model/posterTypes';
import type { ImageQuality, PosterItem, PosterProductionSettings } from '../model/posterTypes';

/** Shared refs keep generation, recovery and history on the same state machine. */
export function usePosterState() {
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
  const [memorySampleId, setMemorySampleId] = useState('');
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
  const memorySampleIdRef = useRef(memorySampleId);
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
  memorySampleIdRef.current = memorySampleId;

  const setItemsIfAlive = useCallback((value: Parameters<typeof setItems>[0]) => {
    if (aliveRef.current) setItems(value);
  }, []);
  const setNoticeIfAlive = useCallback((value: string | null) => {
    if (aliveRef.current) setNotice(value);
  }, []);
  const setIsRunningIfAlive = useCallback((value: boolean) => {
    runningRef.current = value;
    if (aliveRef.current) setIsRunning(value);
  }, []);
  const setIsExportingIfAlive = useCallback((value: boolean) => {
    exportingRef.current = value;
    if (aliveRef.current) setIsExporting(value);
  }, []);

  const currentSettings = (): PosterProductionSettings => ({
    imageModel: imageModelRef.current,
    titleModel: titleModelRef.current,
    titleHandling: titleHandlingRef.current,
    imageQuality: imageQualityRef.current,
    concurrency,
    memorySampleId: memorySampleIdRef.current,
  });

  const workspaceChanged = useCallback(() => workspaceSecretRef.current !== getWorkspaceSecret(), []);
  const ensureWorkspaceReady = useCallback(() => {
    if (!workspaceScopeRef.current) {
      setNoticeIfAlive('工作区尚未准备好，请稍后重试。');
      return false;
    }
    if (workspaceChanged()) {
      setNoticeIfAlive('工作区已切换，请刷新页面后再操作大字报；当前批次仍保存在原工作区。');
      return false;
    }
    return true;
  }, [setNoticeIfAlive, workspaceChanged]);

  const productionModelError = useCallback((settings: PosterProductionSettings) => {
    if (!availableTitleModelsRef.current.some((model) => model.id === settings.titleModel)) return '标题与封面设计模型未启用，请在系统设置中启用模型并更新生产设置。';
    if (!availableImageModelsRef.current.some((model) => model.id === settings.imageModel)) return '当前生图模型未启用，请更新生产设置后再生成。';
    return undefined;
  }, []);

  const abortAllItems = useCallback(() => {
    for (const controller of itemAbortControllers.current.values()) controller.abort();
    itemAbortControllers.current.clear();
  }, []);


  return {
    fileInputRef,
    activeItemsRef,
    activeAttemptsRef,
    aliveRef,
    interruptActiveRef,
    abortRef,
    itemAbortControllers,
    isDraggingFile,
    setIsDraggingFile,
    items,
    setItems,
    isRunning,
    setIsRunning,
    runningRef,
    restoringRef,
    exportingRef,
    importingRef,
    isReady,
    setIsReady,
    isImporting,
    setIsImporting,
    isRestoring,
    setIsRestoring,
    isExporting,
    setIsExporting,
    notice,
    setNotice,
    availableImageModels,
    setAvailableImageModels,
    availableTitleModels,
    setAvailableTitleModels,
    imageModel,
    setImageModel,
    titleModel,
    setTitleModel,
    titleHandling,
    setTitleHandling,
    imageQuality,
    setImageQuality,
    concurrency,
    setConcurrency,
    memorySampleId,
    setMemorySampleId,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsDraft,
    setSettingsDraft,
    previewState,
    setPreviewState,
    historyBatches,
    setHistoryBatches,
    itemsRef,
    titleModelRef,
    availableTitleModelsRef,
    availableImageModelsRef,
    titleHandlingRef,
    imageModelRef,
    imageQualityRef,
    memorySampleIdRef,
    activeBatchIdRef,
    activeBatchCreatedAtRef,
    activeBatchRevisionRef,
    persistedMediaKeysRef,
    mediaWritesRef,
    recoveredResultUrlsRef,
    workspaceSecretRef,
    workspaceScopeRef,
    ownedGenerationLocksRef,
    metadataBarrierRef,
    setItemsIfAlive,
    setNoticeIfAlive,
    setIsRunningIfAlive,
    setIsExportingIfAlive,
    currentSettings,
    workspaceChanged,
    ensureWorkspaceReady,
    productionModelError,
    abortAllItems
  };
}

export type PosterState = ReturnType<typeof usePosterState>;
