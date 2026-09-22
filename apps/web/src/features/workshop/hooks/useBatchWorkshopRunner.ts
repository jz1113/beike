import { useState, useRef, useEffect, useCallback } from 'react';
import { PreviousGroupSignature } from '@beike/domain/vision';
import { type WorkshopBatchStatus } from '@beike/domain/workshopPipeline';
import { applyInvalidationToItems } from '../model/applyInvalidation';
import { createRunControl, type RunControl } from '../model/runControl';
import { dispatchBatchEvent, reviewWorkshopTask } from '../api/batchCommands';
import { useWorkshopShotCount } from './useWorkshopShotCount';
import { 
  BatchProductItem, 
  GenerationStrategy,
  SYSTEM_MASTER_RECIPES 
} from '../model/batchTypes';
import {
  shouldAutoSelectJewelryArch,
} from '@beike/domain/jewelryArch';
import {
  exportBatchExcel,
  exportSingleProductZip,
  downloadSingleTaskImage,
} from '../model/batchRunnerExport';
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
    fallback: 'grid_first',
    isValid: (v): v is GenerationStrategy => v === 'grid_first' || v === 'single_shot',
  });
  // 文案自动生成是批次配置：关闭后仍可在交付页手动写作或按需生成。
  const [autoGenerateCopywriting, setAutoGenerateCopywriting] = useState(true);
  const [activeImgFilter, setActiveImgFilter] = useState<'all' | 'main' | 'sku' | 'detail'>('all');
  const assetLocks = useWorkshopAssetLocks();
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
    if (pendingBatchStage == null) return;
    const stage = Math.max(1, Math.min(4, pendingBatchStage));
    setCurrentStage(stage);
    setPendingBatchStage(null);
  }, [pendingBatchStage, setPendingBatchStage]);

  useEffect(() => {
    if (!pendingBatchPromptImport?.prompts?.length) return;
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
  }, [pendingBatchPromptImport, setPendingBatchPromptImport, showToast]);

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
      setSelectedArchId(jewelryArch.id);
    }
    setUseAssetLibrary(true);
    setGenerationStrategy('grid_first');
  }, [items, recipes, selectedArchId, setSelectedArchId, setGenerationStrategy]);

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // 采编与链接解析
  const handleParseInput = () => {
    const res = parseBatchInputLines(batchInputText, new Set(items.map((i) => i.itemId)));
    if (res.error === 'EMPTY_INPUT') {
      showToast('请输入至少一条商品链接或 SKU');
      return [];
    }
    if (res.error === 'NO_NEW_ITEMS' || res.newItems.length === 0) {
      showToast('没有识别到新的不重复商品');
      return [];
    }
    setItems((prev) => [...prev, ...res.newItems]);
    setBatchInputText('');
    showToast(`成功加入 ${res.newItems.length} 个待采商品`);
    return res.newItems;
  };

  const startBatchCollect = async (itemsToCollect = items) => {
    const pendingItems = itemsToCollect.filter((i) => i.status === 'pending' || i.status === 'failed');
    if (pendingItems.length === 0) {
      showToast('没有待采集或需要重试的商品');
      return;
    }

    setIsCollecting(true);
    setCollectProgress({ total: pendingItems.length, current: 0, success: 0, failed: 0 });

    const res = await runBatchCollect(pendingItems, {
      onItemUpdate: (id, patch) => {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      },
      onProgress: (prog) => {
        setCollectProgress(prog);
      },
      concurrency: 3,
    });

    setIsCollecting(false);
    showToast(`批量采编完成：已就绪 ${res.success} 款商品`);
  };

  // 选图纯函数绑定
  const toggleProductImageSelection = (itemId: string, imgUrl: string) => {
    setItems((prev) => applyInvalidationToItems(
      toggleProductImageSelectionPure(prev, itemId, imgUrl),
      { type: 'product_images', productId: itemId },
    ));
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
    return analyzeBatchProduct(visionAnalyzeDeps, item, itemIndex);
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
        await analyzeBatchProduct(analysisDeps, item, index);
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

  const generateAllCopywriting = async () => {
    await generateAllCopywritingUtil({
      getItems: () => itemsRef.current,
      setItems,
      selectedVisionModel,
      showToast,
      analyzeConcurrency,
    });
  };

  // 导出
  const handleExportZip = async () => {
    await exportBatchExcel(itemsRef.current, {
      setIsExportingZip,
      setExportingSingleItemId,
      setToastMsg: () => {},
      showToast,
    });
  };

  const handleExportExcel = async () => {
    await exportBatchExcel(itemsRef.current, {
      setIsExportingZip,
      setExportingSingleItemId,
      setToastMsg: () => {},
      showToast,
    });
  };

  const handleExportSingleProductZip = async (item: BatchProductItem) => {
    await exportSingleProductZip(item, {
      setIsExportingZip,
      setExportingSingleItemId,
      setToastMsg: () => {},
      showToast,
    });
  };

  const handleDownloadSingleTaskImage = async (url: string, filename?: string) => {
    await downloadSingleTaskImage(url, filename, showToast);
  };

  // 全自动生产流水线
  const startAutoPilotPipeline = async () => {
    await runAutoPilotPipeline({
      successfulItems,
      getItems: () => itemsRef.current,
      setItems,
      startBatchVisionAnalyze,
      startBatchGeneration,
      setCurrentStage,
      showToast,
      setIsAutoPilotRunning,
      isAborted: () => runControlRef.current.status === 'cancelled',
    });
  };

  const pauseRun = () => { runControlRef.current = { status: 'paused' }; setPipelineStatus('paused'); };
  const resumeRun = () => { runControlRef.current = { status: 'running' }; setPipelineStatus('generating'); };
  const cancelRun = () => { runControlRef.current = { status: 'cancelled' }; };

  const completeCurrentBatch = async () => {
    const batch = workspace.activeBatch;
    if (!batch) return;
    await dispatchBatchEvent(batch.id, batch.revision, { type: 'COMPLETE_BATCH' });
    setPipelineStatus('completed');
    showToast('本批次已完成，当前为只读。修改请复制为新批次');
  };

  const reviewTask = (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected') => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        tasks: (item.tasks || []).map((task) => task.id === taskId ? { ...task, outputReview: decision } : task),
      };
    }));
    void reviewWorkshopTask(taskId, { decision }).catch((error) => {
      showToast(error instanceof Error ? error.message : '审核提交失败');
    });
  };

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
  }, [setSelectedArchId, setSelectedShotCount, setGenerationStrategy, setLockedFullPromptId]);

  const workspace = useLiveWorkshopWorkspace({
    currentStage, batchInputText, items,
    selectedVisionModel, selectedImageGenModel, selectedArchId,
    selectedQuality, selectedAspect, selectedShotCount,
    useAssetLibrary, lockedPersonaId, lockedSceneId, lockedOutfitId, lockedActionId, lockedFullPromptId,
    generationStrategy, autoGenerateCopywriting,
    personaMode, pipelineStatus, planRevision, storyboardRevision,
    diversityContext: {
      groupSignatures: batchGroupSignaturesRef.current,
      actionIds: batchActionIdsRef.current,
      sceneIds: batchSceneIdsRef.current,
    },
  }, applyWorkspaceSnapshot);
  activeBatchIdRef.current = workspace.activeBatch?.id || 'draft';

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
    setSelectedArchId,
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
    setLockedPersonaId,
    lockedSceneId,
    setLockedSceneId,
    lockedOutfitId,
    setLockedOutfitId,
    lockedActionId,
    setLockedActionId,
    lockedFullPromptId,
    setLockedFullPromptId,
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
    setSelectedShotCount,
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
    completeCurrentBatch,
    reviewTask,
    toastMsg,
    showToast,
    workspaceError: workspace.error,
    workspaceReady: workspace.ready,
    activeBatch: workspace.activeBatch,
    historyBatches: workspace.historyBatches,
    refreshBatchHistory: workspace.refreshHistory,
    createNewBatch: workspace.createNewBatch,
    duplicateBatch: workspace.duplicateBatch,
    archiveCurrentBatch: workspace.archiveCurrentBatch,
    clearHistory: workspace.clearHistory,
    renameBatch: workspace.renameBatch,
    readBatch: workspace.readBatch,
  };
}
