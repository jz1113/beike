import { recheckWorkshopTask } from '../model/recheckWorkshopTask';
import { useState, useRef, useEffect, useCallback } from 'react';
import { PreviousGroupSignature } from '@beike/domain/vision';
import { type WorkshopBatchStatus } from '@beike/domain/workshopPipeline';
import { applyInvalidationToItems } from '../model/applyInvalidation';
import { createRunControl, type RunControl } from '../model/runControl';
import { useBatchExport } from './useBatchExport';
import { useBatchReview } from './useBatchReview';
import { useWorkspaceSnapshotSync } from './useWorkspaceSnapshotSync';
import { useWorkshopShotCount } from './useWorkshopShotCount';
import { 
  BatchProductItem, 
  GenerationStrategy,
  SYSTEM_MASTER_RECIPES 
} from '../model/batchTypes';
import {
  shouldAutoSelectJewelryArch,
} from '@beike/domain/jewelryArch';
import { analyzeBatchProduct, runBatchVisionAnalyze, type VisionAnalyzeDeps } from '../model/batchVisionAnalyze';
import { useAppStore } from '@/store';

// 🚀 模块化外抽能力
import { usePersistentNumber, usePersistentEnum } from '@/shared/hooks/usePersistentState';
import { useBatchPreviewGallery, useBatchToast } from './useBatchPreviewGallery';
import { fetchRecipes, loadSystemConfiguredModels } from '../model/batchResourceLoader';
import { useWorkshopAssetLocks } from './useWorkshopAssetLocks';
import { parseBatchInputLines, runBatchCollect } from '../model/batchCollect';
import {
  toggleProductImageSelection as toggleProductImageSelectionPure,
  batchSetProductImages as batchSetProductImagesPure,
} from '../model/batchImageSelection';
import {
  generateCopywritingForProduct as generateCopywritingForProductUtil,
  updateItemCopywriting as updateItemCopywritingUtil,
  generateAllCopywriting as generateAllCopywritingUtil,
} from '../model/batchCopywriting';
import { startAutoPilotPipeline as runAutoPilotPipeline } from '../model/batchAutoPilot';
import {
  type TaskExecutionConfig,
} from '../model/batchTaskExecution';
import {
  startBatchGenerationCoordinator,
  retryFailedImageTasksCoordinator,
  retrySingleShotTaskCoordinator,
} from '../model/batchGenerationCoordinator';
import { useLiveWorkshopWorkspace } from '../model/workshopSnapshotBridge';
import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';

export function useBatchWorkshopRunner() {
  const [currentStage, setCurrentStage] = useState<number>(1);

  // 阶段 1: 批量采编与清洗状态
  const [batchInputText, setBatchInputText] = useState('');
  const [items, setItems] = useState<BatchProductItem[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState({ total: 0, current: 0, success: 0, failed: 0 });

  // 配方库（拍摄架构与全局 store 同步，支持资产中心「载入配方」）
  const [recipes, setRecipes] = useState<any[]>(SYSTEM_MASTER_RECIPES);
  const selectedArchId = useAppStore((s) => s.selectedArchId);
  const setSelectedArchId = useAppStore((s) => s.setSelectedArchId);

  // 模型配置
  const [availableVisionModels, setAvailableVisionModels] = useState<any[]>([]);
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>('gemini-3.7-flash');
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  const [selectedImageGenModel, setSelectedImageGenModel] = useState<string>('gpt-image-2');

  // 人像与参数配置
  const [personaMode, setPersonaMode] = useState<'asset_driven' | 'none'>('asset_driven');
  const [pipelineStatus, setPipelineStatus] = useState<WorkshopBatchStatus>('draft');
  const [planRevision, setPlanRevision] = useState(0);
  const [storyboardRevision, setStoryboardRevision] = useState(0);
  const [pipelineRuns, setPipelineRuns] = useState<WorkshopSnapshot['pipeline']['runs']>([]);
  const [selectedQuality, setSelectedQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [selectedAspect, setSelectedAspect] = useState<'3:4' | '1:1' | '9:16' | '16:9'>('3:4');

  // 优先恢复工坊设置；首次使用时沿用首页分镜预设。
  const [selectedShotCount, setSelectedShotCount] = useWorkshopShotCount();

  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });

  // 持久化状态收敛
  const [analyzeConcurrency, setAnalyzeConcurrency] = usePersistentNumber('workshop_analyze_concurrency', {
    fallback: 2,
    min: 1,
    max: 6,
  });

  const [imageGenConcurrency, setImageGenConcurrency] = usePersistentNumber('workshop_batch_concurrency', {
    fallback: 4,
    min: 1,
    max: 50,
  });

  const [generationStrategy, setGenerationStrategy] = usePersistentEnum<GenerationStrategy>('workshop_generation_strategy', {
    fallback: 'single_shot',
    isValid: (v): v is GenerationStrategy => v === 'grid_first' || v === 'single_shot',
  });
  // 文案自动生成是批次配置：关闭后仍可在交付页手动写作或按需生成。
  const [autoGenerateCopywriting, setAutoGenerateCopywriting] = useState(true);
  const [activeImgFilter, setActiveImgFilter] = useState<'all' | 'main' | 'sku' | 'detail'>('all');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const analyzeConfigRevisionRef = useRef(0);
  const handleAppliedBinding = useCallback(() => {
    analyzeConfigRevisionRef.current += 1;
    setItems((previous) => applyInvalidationToItems(previous, { type: 'locked_assets' }));
    setStoryboardRevision((revision) => revision + 1);
  }, []);
  const assetLocks = useWorkshopAssetLocks(workspaceReady, handleAppliedBinding);
  const {
    useAssetLibrary, setUseAssetLibrary, lockedPersonaId, setLockedPersonaId, lockedSceneId, setLockedSceneId,
    lockedOutfitId, setLockedOutfitId, lockedActionId, setLockedActionId, lockedFullPromptId, setLockedFullPromptId,
    availablePersonas, availableScenes, availableOutfits, availableActions, availableFullPrompts,
  } = assetLocks;

  // 批量生图与进度
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [totalTaskCount, setTotalTaskCount] = useState(0);
  const [completedTaskCount, setCompletedTaskCount] = useState(0);
  const [successTaskCount, setSuccessTaskCount] = useState(0);
  const [failTaskCount, setFailTaskCount] = useState(0);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportingSingleItemId, setExportingSingleItemId] = useState<string | null>(null);
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);

  // 预览画廊与 Toast
  const {
    previewImageUrl,
    previewGallery,
    openGalleryPreview,
    closeGalleryPreview,
    setGalleryIndex,
    handleSetPreviewImageUrl,
  } = useBatchPreviewGallery();

  const { toastMsg, showToast } = useBatchToast();

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const runControlRef = useRef<RunControl>(createRunControl());
  const activeBatchIdRef = useRef('draft');
  const batchGroupSignaturesRef = useRef<PreviousGroupSignature[]>([]);
  const batchActionIdsRef = useRef<string[]>([]);
  const batchSceneIdsRef = useRef<string[]>([]);

  // 资源异步加载
  const fetchRecipesHandler = useCallback(async () => {
    await fetchRecipes(setRecipes, setSelectedArchId);
  }, [setSelectedArchId]);

  const loadModelsHandler = useCallback(() => {
    const {
      availableVisionModels: vModels,
      selectedVisionModel: sVision,
      availableImageModels: iModels,
      selectedImageGenModel: sImage,
    } = loadSystemConfiguredModels();
    setAvailableVisionModels(vModels);
    setSelectedVisionModel(sVision);
    setAvailableImageModels(iModels);
    setSelectedImageGenModel(sImage);
  }, []);

  useEffect(() => {
    void fetchRecipesHandler();
    loadModelsHandler();
  }, [fetchRecipesHandler, loadModelsHandler]);

  // 全局 Store 订阅与联动
  const pendingBatchStage = useAppStore((s) => s.pendingBatchStage);
  const setPendingBatchStage = useAppStore((s) => s.setPendingBatchStage);
  const pendingBatchPromptImport = useAppStore((s) => s.pendingBatchPromptImport);
  const setPendingBatchPromptImport = useAppStore((s) => s.setPendingBatchPromptImport);

  useEffect(() => {
    if (!workspaceReady || pendingBatchStage == null) return;
    const stage = Math.max(1, Math.min(4, pendingBatchStage));
    setCurrentStage(stage);
    setPendingBatchStage(null);
  }, [workspaceReady, pendingBatchStage, setPendingBatchStage]);

  useEffect(() => {
    if (!workspaceReady || !pendingBatchPromptImport?.prompts?.length) return;
    const { productTitle, productFingerprint, prompts, referenceImages = [], masterImageIndex } = pendingBatchPromptImport;
    const importId = `hist_${Date.now()}`;

    setItems((prev) => {
      if (
        productFingerprint &&
        prev.some((p) => p.productFingerprint === productFingerprint && p.analyzedSuccess)
      ) {
        return prev;
      }
      const importItem: BatchProductItem = {
        id: importId,
        itemId: importId,
        platform: 'jd',
        title: productTitle || '历史分镜商品',
        price: 0,
        category: '历史导入',
        brand: '',
        coverImage: referenceImages[0] || '',
        mainImages: referenceImages,
        skuImages: [],
        detailImages: [],
        props: {},
        status: 'success',
        selected: true,
        allTypedImages: [],
        selectedProductImages: referenceImages,
        analyzedSuccess: true,
        productFingerprint: productFingerprint || '',
        prompts,
        tasks: [],
      };
      return [...prev, importItem];
    });

    setCurrentStage(3);
    setPendingBatchPromptImport(null);
    showToast(`已载入 ${prompts.length} 条图组分镜${masterImageIndex ? `（母本图 #${masterImageIndex}）` : ''}；场景、镜头动作与同组参考图已联动，可直接确认后生图。`);
  }, [workspaceReady, pendingBatchPromptImport, setPendingBatchPromptImport, showToast]);

  const successfulItems = items.filter((i) => i.status === 'success' && i.selected);

  useEffect(() => {
    if (items.length === 0) return;
    const hasJewelry = items.some(
      (p) => shouldAutoSelectJewelryArch(p.title, p.props) || /珠宝|首饰/i.test(p.category || '')
    );
    if (!hasJewelry) return;

    const jewelryArch = recipes.find(
      (r) =>
        r.id === 'recipe_jewelry_master' ||
        r.id === 'arch_jewelry_master' ||
        /珠宝首饰/.test(String(r.name))
    );
    if (jewelryArch && (!selectedArchId || selectedArchId === 'auto' || selectedArchId === 'arch_jewelry_master' || selectedArchId === SYSTEM_MASTER_RECIPES[0]?.id)) {
      analyzeConfigRevisionRef.current += 1;
      setSelectedArchId(jewelryArch.id);
      setItems((prev) => applyInvalidationToItems(prev, { type: 'architecture' }));
      setStoryboardRevision((revision) => revision + 1);
    }
    setUseAssetLibrary(true);
  }, [items, recipes, selectedArchId, setSelectedArchId, setUseAssetLibrary]);

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // 采编与链接解析
  const collectInFlight = useRef(false);

  const handleParseInput = () => {
    if (collectInFlight.current) return [];
    const { newItems: created, error } = parseBatchInputLines(
      batchInputText, new Set(itemsRef.current.map((i) => `${i.platform}:${i.itemId}`)),
    );
    if (error === 'EMPTY_INPUT') {
      showToast('请输入至少一条商品链接或 SKU');
      return [];
    }
    if (error === 'NO_NEW_ITEMS' || created.length === 0) {
      showToast('没有识别到新的不重复商品');
      return [];
    }
    const nextItems = [...itemsRef.current, ...created];
    itemsRef.current = nextItems;
    setItems(nextItems);
    setBatchInputText('');
    showToast(`成功加入 ${created.length} 个待采商品`);
    return created;
  };

  const startBatchCollect = async (itemsToCollect = items) => {
    if (collectInFlight.current) return;
    const pendingItems = itemsToCollect.filter((i) => i.status === 'pending' || i.status === 'failed');
    if (pendingItems.length === 0) {
      showToast('没有待采集或需要重试的商品');
      return;
    }

    collectInFlight.current = true;
    setIsCollecting(true);
    setCollectProgress({ total: pendingItems.length, current: 0, success: 0, failed: 0 });

    let res = { success: 0, failed: 0 };
    try {
    res = await runBatchCollect(pendingItems, {
      onItemUpdate: (id, patch) => {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      },
      onProgress: (prog) => {
        setCollectProgress(prog);
      },
      concurrency: 3,
    });
    showToast(`批量采编完成：已就绪 ${res.success} 款${res.failed ? `，失败 ${res.failed} 款` : ''}`);
    } finally {
      collectInFlight.current = false;
      setIsCollecting(false);
    }
  };

  // 选图纯函数绑定
  const toggleProductImageSelection = (itemId: string, imgUrl: string) => {
    setItems((prev) => applyInvalidationToItems(
      toggleProductImageSelectionPure(prev, itemId, imgUrl),
      { type: 'product_images', productId: itemId },
    ));
  };

  const invalidateWorkshopConfig = (type: 'architecture' | 'shot_count' | 'locked_assets') => {
    analyzeConfigRevisionRef.current += 1;
    setItems((prev) => applyInvalidationToItems(prev, { type }));
    setStoryboardRevision((revision) => revision + 1);
  };
  const changeSelectedArchId = (id: string) => {
    if (id === selectedArchId) return;
    setSelectedArchId(id);
    invalidateWorkshopConfig('architecture');
  };
  const changeSelectedShotCount = (count: number) => {
    if (count === selectedShotCount) return;
    setSelectedShotCount(count);
    invalidateWorkshopConfig('shot_count');
  };
  const changeLockedAsset = (apply: (value: string) => void, current: string) => (value: string) => {
    if (value === current) return;
    apply(value);
    invalidateWorkshopConfig('locked_assets');
  };

  const batchSetProductImages = (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => {
    setItems((prev) => applyInvalidationToItems(
      batchSetProductImagesPure(prev, itemId, mode),
      { type: 'product_images', productId: itemId },
    ));
  };

  // 视觉分析
  const visionAnalyzeDeps: VisionAnalyzeDeps = {
    recipes,
    selectedArchId,
    items,
    availablePersonas,
    availableScenes,
    availableOutfits,
    selectedShotCount,
    lockedPersonaId,
    lockedSceneId,
    lockedOutfitId,
    lockedActionId,
    lockedFullPromptId,
    personaMode,
    selectedVisionModel,
    availableVisionModels: availableVisionModels.map((m) => ({ id: m.id })),
    useAssetLibrary,
    setItems,
    getItems: () => itemsRef.current,
    getConfigRevision: () => analyzeConfigRevisionRef.current,
    batchGroupSignaturesRef,
    batchActionIdsRef,
    batchSceneIdsRef,
    batchId: activeBatchIdRef.current,
  };

  const analyzeSingleProduct = async (
    item: BatchProductItem,
    itemIndexOrSig?: number | PreviousGroupSignature
  ): Promise<boolean> => {
    const itemIndex = typeof itemIndexOrSig === 'number' ? itemIndexOrSig : undefined;
    const ok = await analyzeBatchProduct(visionAnalyzeDeps, item, itemIndex);
    if (ok) setStoryboardRevision((revision) => revision + 1);
    return ok;
  };

  const startBatchVisionAnalyze = async (architectureId = selectedArchId): Promise<number> => {
    if (!recipes.some((recipe) => recipe.id === architectureId)) {
      showToast('请先确认类目拍摄架构，再开始提示词分析');
      return 0;
    }

    const analysisDeps = architectureId === selectedArchId
      ? visionAnalyzeDeps
      : { ...visionAnalyzeDeps, selectedArchId: architectureId };

    const activeItems = itemsRef.current.filter((i) => i.status === 'success' && i.selected);
    if (activeItems.length === 0) {
      showToast('没有待分析的商品');
      return 0;
    }

    setIsAnalyzingAll(true);
    setAnalyzeProgress({ current: 0, total: activeItems.length });

    const successCount = await runBatchVisionAnalyze({
      items: activeItems,
      concurrency: analyzeConcurrency || 2,
      isAborted: () => runControlRef.current.status === 'cancelled',
      analyzeOne: async (item, index) => {
        return analyzeBatchProduct(analysisDeps, item, index);
      },
      onItemStart: () => {},
      onItemFinish: (finished, total) => {
        setAnalyzeProgress({ current: finished, total });
      },
      onItemError: (item, err) => {
        console.warn('[BatchVision] 分析失败:', item.title, err);
      },
    });

    setIsAnalyzingAll(false);
    const failedCount = activeItems.length - successCount;
    showToast(`AI 视觉分析完毕：${successCount} 款成功${failedCount > 0 ? `，${failedCount} 款待重试` : ''}`);
    return successCount;
  };

  // 任务执行配置
  const taskExecutionConfig: TaskExecutionConfig = {
    selectedQuality,
    selectedAspect,
    selectedImageGenModel,
    selectedShotCount,
    lockedSceneId,
    availableScenes,
    isAborted: () => runControlRef.current.status === 'cancelled',
    isPaused: () => runControlRef.current.status === 'paused',
  };

  // 批量生图调度
  const startBatchGeneration = async () => {
    await startBatchGenerationCoordinator({
      config: taskExecutionConfig,
      generationStrategy,
      imageGenConcurrency: imageGenConcurrency || 4,
      itemsRef,
      setItems,
      runControlRef,
      batchId: activeBatchIdRef.current,
      storyboardRevision,
      showToast,
      setCurrentStage,
      setIsGeneratingBatch,
      setTotalTaskCount,
      setCompletedTaskCount,
      setSuccessTaskCount,
      setFailTaskCount,
      autoGenerateCopywriting,
      generateAllCopywriting,
    });
  };

  // 失败重试
  const retryFailedImageTasks = async () => {
    await retryFailedImageTasksCoordinator(
      {
        config: taskExecutionConfig,
        generationStrategy,
        imageGenConcurrency: imageGenConcurrency || 4,
        itemsRef,
        setItems,
        runControlRef,
        batchId: activeBatchIdRef.current,
        storyboardRevision,
        showToast,
        setCurrentStage,
        setIsGeneratingBatch,
        setTotalTaskCount,
        setCompletedTaskCount,
        setSuccessTaskCount,
        setFailTaskCount,
        autoGenerateCopywriting,
        generateAllCopywriting,
      },
      successfulItems,
      isGeneratingBatch
    );
  };

  const retrySingleShotTask = async (itemId: string, shotIndex: number) => {
    await retrySingleShotTaskCoordinator(
      itemId,
      shotIndex,
      items,
      setItems,
      taskExecutionConfig,
      showToast
    );
  };

  // 文案生成
  const generateCopywritingForProduct = async (item: BatchProductItem) => {
    await generateCopywritingForProductUtil(item, {
      getItems: () => itemsRef.current,
      setItems,
      selectedVisionModel,
      showToast,
      analyzeConcurrency,
    });
  };

  const updateItemCopywriting = (
    itemId: string,
    copywriting: { title: string; content: string; tags?: string[] }
  ) => {
    updateItemCopywritingUtil(setItems, itemId, copywriting);
  };

  const generateAllCopywriting = async (options?: { force?: boolean }) => {
    await generateAllCopywritingUtil({
      getItems: () => itemsRef.current,
      setItems,
      selectedVisionModel,
      showToast,
      analyzeConcurrency,
      force: options?.force,
    });
  };

  const {
    handleExportZip,
    handleExportExcel,
    handleExportSingleProductZip,
    handleDownloadSingleTaskImage,
  } = useBatchExport(itemsRef, showToast, setIsExportingZip, setExportingSingleItemId);

  // 全自动生产流水线
  const startAutoPilotPipeline = async () => {
    await runAutoPilotPipeline({
      successfulItems,
      getItems: () => itemsRef.current,
      setItems,
      startBatchVisionAnalyze,
      setCurrentStage,
      showToast,
      setIsAutoPilotRunning,
      isAborted: () => runControlRef.current.status === 'cancelled',
    });
  };

  const pauseRun = () => { runControlRef.current = { status: 'paused' }; setPipelineStatus('paused'); };
  const resumeRun = () => { runControlRef.current = { status: 'running' }; setPipelineStatus('generating'); };
  const cancelRun = () => {
    runControlRef.current = { status: 'cancelled' };
    setPipelineStatus((status) => (status === 'paused' || status === 'generating' ? 'cancelled' : status));
  };
  const acknowledgeRecovery = () => {
    setItems((prev) => prev.map((item) => ({
      ...item,
      tasks: (item.tasks || []).map((task) => (task.recoveryRequired ? { ...task, recoveryRequired: false } : task)),
    })));
  };

  const completeCurrentBatch = async () => {
    if (isGeneratingBatch || isAnalyzingAll || isCollecting || isAutoPilotRunning || itemsRef.current.some((item) => item.isAnalyzing || item.isCopywritingGenerating || item.tasks.some((task) => task.status === 'IN_PROGRESS'))) {
      showToast('仍有任务执行中，请等待结束后再归档本批次');
      return;
    }
    if (!window.confirm('完成本批次后会归档当前内容，并开始一个空白新批次。历史内容可在批次历史中恢复。确定继续吗？')) return;
    try {
      await workspace.archiveCurrentBatch(true);
      showToast('本批次已归档，已开始新的空白批次');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '完成本批次失败');
    }
  };

  const { reviewTask } = useBatchReview(itemsRef, setItems, retrySingleShotTask, showToast);

  const applyWorkspaceSnapshot = useCallback((value: WorkshopSnapshot) => {
    setCurrentStage(value.currentStage);
    setBatchInputText(value.batchInputText);
    setItems(value.items as BatchProductItem[]);
    setSelectedVisionModel(value.settings.selectedVisionModel);
    setSelectedImageGenModel(value.settings.selectedImageGenModel);
    setSelectedArchId(value.settings.selectedArchId);
    setPersonaMode(value.settings.personaMode || 'asset_driven');
    setPipelineStatus((value.pipeline?.status || 'draft') as WorkshopBatchStatus);
    setPlanRevision(value.pipeline?.planRevision || 0);
    setStoryboardRevision(value.pipeline?.storyboardRevision || 0);
    setSelectedQuality(value.settings.selectedQuality);
    setSelectedAspect(value.settings.selectedAspect);
    setSelectedShotCount(value.settings.selectedShotCount);
    setUseAssetLibrary(value.settings.useAssetLibrary);
    setLockedPersonaId(value.settings.lockedPersonaId || 'auto');
    setLockedSceneId(value.settings.lockedSceneId || 'auto');
    setLockedOutfitId(value.settings.lockedOutfitId || 'auto');
    setLockedActionId(value.settings.lockedActionId || 'auto');
    setLockedFullPromptId(value.settings.lockedFullPromptId || 'auto');
    setGenerationStrategy(value.settings.generationStrategy);
    setAutoGenerateCopywriting(value.settings.autoGenerateCopywriting);
    batchGroupSignaturesRef.current = value.pipeline?.diversityContext?.groupSignatures || [];
    batchActionIdsRef.current = value.pipeline?.diversityContext?.actionIds || [];
    batchSceneIdsRef.current = value.pipeline?.diversityContext?.sceneIds || [];
    setPipelineRuns(value.pipeline?.runs || []);
  }, [setSelectedArchId, setSelectedShotCount, setGenerationStrategy, setLockedFullPromptId]);

  const workspace = useLiveWorkshopWorkspace({
    currentStage, batchInputText, items,
    selectedVisionModel, selectedImageGenModel, selectedArchId,
    selectedQuality, selectedAspect, selectedShotCount,
    useAssetLibrary, lockedPersonaId, lockedSceneId, lockedOutfitId, lockedActionId, lockedFullPromptId,
    generationStrategy, autoGenerateCopywriting,
    personaMode, pipelineStatus, planRevision, storyboardRevision,
    pipelineRuns,
    diversityContext: {
      groupSignatures: batchGroupSignaturesRef.current,
      actionIds: batchActionIdsRef.current,
      sceneIds: batchSceneIdsRef.current,
    },
  }, applyWorkspaceSnapshot);
  activeBatchIdRef.current = workspace.activeBatch?.id || 'draft';

  useEffect(() => {
    if (workspace.ready) setWorkspaceReady(true);
  }, [workspace.ready]);

  useWorkspaceSnapshotSync(workspace.ready, currentStage, setCurrentStage, itemsRef);

  return {
    currentStage,
    setCurrentStage,
    batchInputText,
    setBatchInputText,
    items,
    setItems,
    isCollecting,
    collectProgress,
    successfulItems,
    handleRemoveItem,
    handleParseInput,
    startBatchCollect,
    recipes,
    selectedArchId,
    setSelectedArchId: changeSelectedArchId,
    availableVisionModels,
    selectedVisionModel,
    setSelectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
    setSelectedImageGenModel,
    personaMode,
    setPersonaMode,
    pipelineStatus,
    useAssetLibrary,
    setUseAssetLibrary,
    lockedPersonaId,
    setLockedPersonaId: changeLockedAsset(setLockedPersonaId, lockedPersonaId),
    lockedSceneId,
    setLockedSceneId: changeLockedAsset(setLockedSceneId, lockedSceneId),
    lockedOutfitId,
    setLockedOutfitId: changeLockedAsset(setLockedOutfitId, lockedOutfitId),
    lockedActionId,
    setLockedActionId: changeLockedAsset(setLockedActionId, lockedActionId),
    lockedFullPromptId,
    setLockedFullPromptId: changeLockedAsset(setLockedFullPromptId, lockedFullPromptId),
    availablePersonas,
    availableScenes,
    availableOutfits,
    availableActions,
    availableFullPrompts,
    selectedQuality,
    setSelectedQuality,
    selectedAspect,
    setSelectedAspect,
    selectedShotCount,
    setSelectedShotCount: changeSelectedShotCount,
    isAnalyzingAll,
    analyzeProgress,
    activeImgFilter,
    setActiveImgFilter,
    toggleProductImageSelection,
    batchSetProductImages,
    analyzeSingleProduct,
    startBatchVisionAnalyze,
    analyzeConcurrency,
    setAnalyzeConcurrency,
    isGeneratingBatch,
    totalTaskCount,
    completedTaskCount,
    successTaskCount,
    failTaskCount,
    startBatchGeneration,
    retryFailedImageTasks,
    retrySingleShotTask,
    recheckTask: (itemId: string, taskId: string) => recheckWorkshopTask(itemId, taskId, itemsRef.current, setItems, showToast, {
      selectedAspect, selectedQuality, selectedImageGenModel,
    }),
    generateCopywritingForProduct,
    updateItemCopywriting,
    generateAllCopywriting,
    isExportingZip,
    exportingSingleItemId,
    handleExportZip,
    handleExportExcel,
    handleExportSingleProductZip,
    handleDownloadSingleTaskImage,
    generationStrategy,
    setGenerationStrategy,
    autoGenerateCopywriting,
    setAutoGenerateCopywriting,
    imageGenConcurrency,
    setImageGenConcurrency,
    previewImageUrl,
    setPreviewImageUrl: handleSetPreviewImageUrl,
    previewGallery,
    openGalleryPreview,
    closeGalleryPreview,
    setGalleryIndex,
    isAutoPilotRunning,
    startAutoPilotPipeline,
    pauseRun,
    resumeRun,
    cancelRun,
    acknowledgeRecovery,
    completeCurrentBatch,
    reviewTask,
    toastMsg,
    showToast,
    workspaceError: workspace.error,
    workspaceStatus: workspace.status,
    reloadWorkspace: workspace.reload,
    workspaceReady: workspace.ready,
    activeBatch: workspace.activeBatch,
    historyBatches: workspace.historyBatches,
    refreshBatchHistory: workspace.refreshHistory,
    createNewBatch: workspace.createNewBatch,
    duplicateBatch: workspace.duplicateBatch,
    archiveCurrentBatch: workspace.archiveCurrentBatch,
    clearHistory: workspace.clearHistory,
    deleteHistoryBatch: workspace.deleteHistoryBatch,
    renameBatch: workspace.renameBatch,
    readBatch: workspace.readBatch,
  };
}
